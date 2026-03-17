/**
 * @fileoverview WAHA Inbound Webhook
 *
 * Recebe eventos do WAHA (WhatsApp HTTP API self-hosted).
 * Quando uma mensagem inbound chega:
 *   1. Persiste conversa + mensagem no banco (service role, bypassa RLS)
 *   2. Busca o deal ativo do contato no board QUALIFICATION
 *   3. Dispara onResponseReceived() para mover o deal no funil
 *
 * Payload WAHA (event = "message"):
 * {
 *   "event": "message",
 *   "session": "default",
 *   "payload": {
 *     "id": "...",
 *     "from": "5511999990000@c.us",
 *     "body": "Oi, tudo bem?",
 *     "hasMedia": false,
 *     "timestamp": 1710000000
 *   }
 * }
 *
 * Segurança: header x-waha-secret validado com timingSafeEqual.
 */

import { NextResponse } from 'next/server';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { onResponseReceived } from '@/lib/automation/triggers';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WahaWebhookPayload {
  id?: string;
  from?: string;
  body?: string;
  hasMedia?: boolean;
  timestamp?: number;
}

interface WahaWebhookBody {
  event?: string;
  session?: string;
  payload?: WahaWebhookPayload;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Remove o sufixo "@c.us", "whatsapp:" e qualquer não-dígito.
 * Retorna somente os dígitos do número.
 */
export function normalizeWahaPhone(raw: string): string {
  return raw
    .replace(/@c\.us$/i, '')
    .replace(/whatsapp:/gi, '')
    .replace(/[^0-9]/g, '');
}

/**
 * Valida o segredo do webhook com comparação em tempo constante
 * para evitar timing attacks.
 */
function validateSecret(receivedSecret: string | null): boolean {
  const expected = process.env.WAHA_WEBHOOK_SECRET;
  if (!expected) return true; // segredo não configurado = sem validação (dev)

  if (!receivedSecret) return false;

  const enc = new TextEncoder();
  const a = enc.encode(expected);
  const b = enc.encode(receivedSecret);

  if (a.length !== b.length) return false;

  // timingSafeEqual via Web Crypto (disponível no Node runtime do Next.js)
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

type AdminClient = ReturnType<typeof createStaticAdminClient>;

async function findActiveDealByPhone(
  supabase: AdminClient,
  phone: string
): Promise<{ dealId: string; boardId: string; organizationId: string } | null> {
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, organization_id')
    .or(`phone.ilike.%${phone}%,whatsapp.ilike.%${phone}%`)
    .limit(5);

  if (!contacts || contacts.length === 0) return null;

  for (const contact of contacts) {
    const { data: deals } = await supabase
      .from('deals')
      .select('id, board_id, boards!inner(id, template)')
      .eq('contact_id', contact.id)
      .eq('organization_id', contact.organization_id)
      .is('won_at', null)
      .is('lost_at', null)
      .eq('boards.template', 'QUALIFICATION')
      .limit(1);

    if (deals && deals.length > 0) {
      const deal = deals[0] as Record<string, unknown>;
      return {
        dealId: deal.id as string,
        boardId: deal.board_id as string,
        organizationId: contact.organization_id as string,
      };
    }
  }

  return null;
}

async function upsertConversationAndMessage(
  supabase: AdminClient,
  params: {
    organizationId: string;
    contactId: string | null;
    dealId: string | null;
    waChatId: string;
    waMessageId: string;
    body: string;
    sentAt: string;
  }
): Promise<void> {
  // Upsert conversa
  const { data: conv } = await supabase
    .from('conversations')
    .upsert(
      {
        organization_id: params.organizationId,
        contact_id: params.contactId,
        deal_id: params.dealId,
        wa_chat_id: params.waChatId,
        channel: 'whatsapp',
        last_message_at: params.sentAt,
        unread_count: 1,
      },
      { onConflict: 'organization_id,wa_chat_id', ignoreDuplicates: false }
    )
    .select('id, unread_count')
    .single();

  if (!conv?.id) return;

  // Incrementar unread_count se a conversa já existia
  await supabase
    .from('conversations')
    .update({
      last_message_at: params.sentAt,
      unread_count: (conv.unread_count ?? 0) + 1,
    })
    .eq('id', conv.id);

  // Inserir mensagem (ignora duplicatas por wa_message_id)
  await supabase.from('messages').upsert(
    {
      organization_id: params.organizationId,
      conversation_id: conv.id,
      wa_message_id: params.waMessageId,
      direction: 'inbound',
      body: params.body,
      status: 'delivered',
      sent_at: params.sentAt,
    },
    { onConflict: 'organization_id,wa_message_id', ignoreDuplicates: true }
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // Validar segredo
  const secret = request.headers.get('x-waha-secret');
  if (!validateSecret(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const webhookBody = await request.json().catch(() => ({})) as WahaWebhookBody;
  const { event, payload } = webhookBody;

  // Ignorar eventos que não são mensagens novas
  if (event !== 'message') {
    return NextResponse.json({ ok: true, ignored: true, event });
  }

  const fromRaw = payload?.from ?? '';
  const messageId = payload?.id ?? '';
  const body = payload?.body ?? '';
  const timestamp = payload?.timestamp ?? Date.now() / 1000;
  const sentAt = new Date(timestamp * 1000).toISOString();

  if (!fromRaw) {
    return NextResponse.json({ error: 'Missing from field' }, { status: 422 });
  }

  const supabase = createStaticAdminClient();
  const normalizedPhone = normalizeWahaPhone(fromRaw);

  // Buscar deal ativo para disparar automação
  const match = await findActiveDealByPhone(supabase, normalizedPhone);

  // Persistir conversa e mensagem
  await upsertConversationAndMessage(supabase, {
    organizationId: match?.organizationId ?? '',
    contactId: null, // será linkado quando tivermos contactId via match
    dealId: match?.dealId ?? null,
    waChatId: fromRaw.includes('@c.us') ? fromRaw : `${normalizedPhone}@c.us`,
    waMessageId: messageId || `${fromRaw}-${timestamp}`,
    body,
    sentAt,
  });

  if (match) {
    await onResponseReceived(match);
    return NextResponse.json({ ok: true, matched: true, dealId: match.dealId });
  }

  return NextResponse.json({ ok: true, matched: false });
}
