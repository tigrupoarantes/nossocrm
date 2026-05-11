/**
 * @fileoverview Captura automatica de leads que chegam via WhatsApp inbound.
 *
 * Quando uma mensagem chega de numero desconhecido (sem contato e sem deal
 * ativo), os webhooks WAHA / Meta usam `ensureContactAndDealFromInbound` para:
 *   1. Garantir um contato (cria se nao existir)
 *   2. Criar um deal no board/stage configurado em `organization_settings`
 *      (whatsapp_capture_board_id / whatsapp_capture_stage_id)
 *   3. Disparar `onDealCreated` para que as regras de automacao rodem
 *
 * Dedup: se o mesmo contato ja gerou um deal nos ultimos 30 segundos,
 * reusamos esse deal em vez de criar um novo (evita 10 deals para 10 mensagens
 * em sequencia de um spammer).
 *
 * Se a organizacao nao configurou board/stage de captura, a funcao retorna
 * null e o comportamento antigo (conversa orfa) e preservado.
 */

import { createStaticAdminClient } from '@/lib/supabase/server';

type AdminClient = ReturnType<typeof createStaticAdminClient>;

export interface InboundDealContext {
  dealId: string;
  boardId: string;
  organizationId: string;
}

interface EnsureParams {
  organizationId: string;
  normalizedPhone: string;
  /** Corpo da primeira mensagem — usado como hint para o `title` do deal. */
  body?: string | null;
  /** Contact ID se ja conhecido (otimizacao — evita re-query). */
  existingContactId?: string | null;
}

const DEDUP_WINDOW_MS = 30_000;

async function getCaptureConfig(
  supabase: AdminClient,
  organizationId: string,
): Promise<{ boardId: string; stageId: string } | null> {
  const { data } = await supabase
    .from('organization_settings')
    .select('whatsapp_capture_board_id, whatsapp_capture_stage_id')
    .eq('organization_id', organizationId)
    .maybeSingle();

  const boardId = (data as { whatsapp_capture_board_id?: string | null } | null)
    ?.whatsapp_capture_board_id ?? null;
  const stageId = (data as { whatsapp_capture_stage_id?: string | null } | null)
    ?.whatsapp_capture_stage_id ?? null;

  if (!boardId || !stageId) return null;
  return { boardId, stageId };
}

async function findOrCreateContact(
  supabase: AdminClient,
  params: { organizationId: string; normalizedPhone: string; body?: string | null; existingContactId?: string | null },
): Promise<string | null> {
  if (params.existingContactId) return params.existingContactId;

  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', params.organizationId)
    .ilike('phone', `%${params.normalizedPhone}%`)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const seedName = (params.body ?? '').trim().slice(0, 40)
    || `Lead ${params.normalizedPhone}`;

  const { data: created, error } = await supabase
    .from('contacts')
    .insert({
      organization_id: params.organizationId,
      name: seedName,
      phone: params.normalizedPhone,
      whatsapp: params.normalizedPhone,
      lifecycle_stage: 'LEAD',
    })
    .select('id')
    .single();

  if (error || !created) {
    console.error('[inboundCapture] falhou criar contato', error?.message);
    return null;
  }
  return created.id as string;
}

async function findRecentDealForContact(
  supabase: AdminClient,
  organizationId: string,
  contactId: string,
): Promise<InboundDealContext | null> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from('deals')
    .select('id, board_id')
    .eq('organization_id', organizationId)
    .eq('contact_id', contactId)
    .gte('created_at', since)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    dealId: data.id as string,
    boardId: data.board_id as string,
    organizationId,
  };
}

/**
 * Garante que existe contato + deal para uma mensagem inbound. Retorna o
 * contexto do deal pronto pra disparar `onDealCreated`. Retorna null se a
 * organizacao nao configurou captura ou se a criacao falhou.
 */
export async function ensureContactAndDealFromInbound(
  supabase: AdminClient,
  params: EnsureParams,
): Promise<InboundDealContext | null> {
  const capture = await getCaptureConfig(supabase, params.organizationId);
  if (!capture) {
    return null;
  }

  const contactId = await findOrCreateContact(supabase, params);
  if (!contactId) return null;

  // Dedup: spammer mandando 10 msgs/seg nao vira 10 deals
  const recent = await findRecentDealForContact(supabase, params.organizationId, contactId);
  if (recent) return recent;

  const titleHint = (params.body ?? '').trim().slice(0, 60)
    || `WhatsApp: ${params.normalizedPhone}`;

  const { data: deal, error } = await supabase
    .from('deals')
    .insert({
      organization_id: params.organizationId,
      board_id: capture.boardId,
      stage_id: capture.stageId,
      contact_id: contactId,
      title: titleHint,
      value: 0,
      probability: 0,
      priority: 'medium',
      is_won: false,
      is_lost: false,
      custom_fields: {
        origin: 'whatsapp_inbound',
        captured_at: new Date().toISOString(),
      },
    })
    .select('id, board_id')
    .single();

  if (error || !deal) {
    console.error('[inboundCapture] falhou criar deal', error?.message);
    return null;
  }

  return {
    dealId: deal.id as string,
    boardId: deal.board_id as string,
    organizationId: params.organizationId,
  };
}
