/**
 * @fileoverview WAHA Inbound Webhook
 *
 * Recebe eventos do WAHA (WhatsApp HTTP API self-hosted).
 * Quando uma mensagem inbound chega:
 *   1. Resolve organization_id via session name (waha_config.sessionName)
 *   2. Procura contato e (opcional) deal ativo
 *   3. Persiste conversa + mensagem (sempre, sem gate de deal)
 *   4. Dispara onResponseReceived() se houver deal vinculado
 *   5. Processa Super Agente em background
 *   6. Grava em webhook_logs (visível em /settings/diagnostico)
 *
 * Payload WAHA (event = "message"):
 * {
 *   "event": "message",
 *   "session": "Whats_CRM",
 *   "payload": {
 *     "id": "...",
 *     "from": "5511999990000@c.us",
 *     "body": "Oi, tudo bem?",
 *     "fromMe": false,
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
import { processWithSuperAgent } from '@/lib/ai/super-agent/engine';
import { resolveWahaConfigBySession } from '@/lib/communication/meta-config-resolver';
import { rehostInboundMedia, categorizeMime } from '@/lib/communication/media-rehost';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WahaWebhookPayload {
  id?: string;
  from?: string;
  body?: string;
  fromMe?: boolean;
  hasMedia?: boolean;
  timestamp?: number;
  /** WAHA inclui metadados da mídia quando hasMedia=true. */
  media?: {
    url?: string;
    mimetype?: string;
    filename?: string | null;
  };
  /** Fallback: alguns payloads colocam mediaUrl direto. */
  mediaUrl?: string;
  /** WAHA GOWS engine inclui dados extras com o telefone real em _data.Info.SenderAlt */
  _data?: {
    Info?: {
      SenderAlt?: string;
      PushName?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
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
 * Remove sufixos conhecidos (@c.us, @s.whatsapp.net, @lid, whatsapp:)
 * e retorna somente os dígitos do número.
 */
export function normalizeWahaPhone(raw: string): string {
  return raw
    .replace(/@c\.us$/i, '')
    .replace(/@s\.whatsapp\.net$/i, '')
    .replace(/@lid$/i, '')
    .replace(/whatsapp:/gi, '')
    .replace(/[^0-9]/g, '');
}

/**
 * Extrai o telefone real do payload WAHA.
 *
 * WAHA 2026.x com engine GOWS usa LID (Linked ID) no campo `from`
 * (ex: "270205083242639@lid") — que NÃO é um telefone. O telefone
 * real fica em `_data.Info.SenderAlt` (ex: "5516991370740@s.whatsapp.net").
 *
 * Fallback chain:
 *   1. payload._data.Info.SenderAlt (telefone real, formato @s.whatsapp.net)
 *   2. payload.from se NÃO terminar em @lid (formato legado @c.us)
 *   3. payload.from como último recurso (LID — vai criar conversa com ID errado, mas não perde a mensagem)
 */
export function extractRealPhone(payload: WahaWebhookPayload): string {
  // Preferir SenderAlt (telefone real) quando disponível
  const senderAlt = payload?._data?.Info?.SenderAlt;
  if (typeof senderAlt === 'string' && senderAlt.length > 5) {
    return senderAlt;
  }
  return payload?.from ?? '';
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

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

type AdminClient = ReturnType<typeof createStaticAdminClient>;

async function findContactByPhone(
  supabase: AdminClient,
  organizationId: string,
  phone: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', organizationId)
    .ilike('phone', `%${phone}%`)
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function findActiveDealForContact(
  supabase: AdminClient,
  organizationId: string,
  contactId: string,
): Promise<{ dealId: string; boardId: string; organizationId: string } | null> {
  const { data: deals } = await supabase
    .from('deals')
    .select('id, board_id, boards!inner(id, template)')
    .eq('contact_id', contactId)
    .eq('organization_id', organizationId)
    .is('won_at', null)
    .is('lost_at', null)
    .eq('boards.template', 'QUALIFICATION')
    .limit(1);

  if (!deals || deals.length === 0) return null;
  const deal = deals[0] as Record<string, unknown>;
  return {
    dealId: deal.id as string,
    boardId: deal.board_id as string,
    organizationId,
  };
}

/**
 * Busca defensiva por conversa existente. Tenta primeiro o formato canônico
 * (@c.us) e cai para o legado (@s.whatsapp.net) por compatibilidade.
 */
async function findExistingConversation(
  supabase: AdminClient,
  organizationId: string,
  phoneDigits: string,
): Promise<{ id: string; wa_chat_id: string } | null> {
  const candidates = [`${phoneDigits}@c.us`, `${phoneDigits}@s.whatsapp.net`];
  for (const candidate of candidates) {
    const { data } = await supabase
      .from('conversations')
      .select('id, wa_chat_id')
      .eq('organization_id', organizationId)
      .eq('wa_chat_id', candidate)
      .maybeSingle();
    if (data?.id) {
      return { id: data.id as string, wa_chat_id: data.wa_chat_id as string };
    }
  }
  return null;
}

async function persistInboundMessage(
  supabase: AdminClient,
  params: {
    organizationId: string;
    contactId: string | null;
    dealId: string | null;
    phoneDigits: string;
    waMessageId: string;
    body: string;
    sentAt: string;
    messageType?: 'text' | 'image' | 'audio' | 'video' | 'document' | 'file';
    mediaUrl?: string | null;
  },
): Promise<string | null> {
  const existing = await findExistingConversation(
    supabase,
    params.organizationId,
    params.phoneDigits,
  );

  let conversationId: string;

  if (existing) {
    conversationId = existing.id;
    const { data: convCurrent } = await supabase
      .from('conversations')
      .select('unread_count')
      .eq('id', conversationId)
      .single();
    await supabase
      .from('conversations')
      .update({
        last_message_at: params.sentAt,
        unread_count: ((convCurrent?.unread_count as number | null) ?? 0) + 1,
        ...(params.contactId ? { contact_id: params.contactId } : {}),
        ...(params.dealId ? { deal_id: params.dealId } : {}),
      })
      .eq('id', conversationId);
  } else {
    const { data: newConv, error: createErr } = await supabase
      .from('conversations')
      .insert({
        organization_id: params.organizationId,
        contact_id: params.contactId,
        deal_id: params.dealId,
        wa_chat_id: `${params.phoneDigits}@c.us`,
        channel: 'whatsapp',
        last_message_at: params.sentAt,
        unread_count: 1,
        channel_metadata: {},
      })
      .select('id')
      .single();

    if (createErr || !newConv?.id) {
      console.error('[WahaWebhook] failed to create conversation', { error: createErr?.message, phone: params.phoneDigits });
      return null;
    }
    conversationId = newConv.id as string;
  }

  // Usar a constraint não-parcial (organization_id, wa_message_id) para o upsert.
  // A constraint parcial idx_messages_external_unique (organization_id, external_message_id
  // WHERE external_message_id IS NOT NULL) NÃO funciona com PostgREST ON CONFLICT —
  // causa erro silencioso e a mensagem nunca é persistida.
  const { error: msgErr } = await supabase.from('messages').upsert(
    {
      organization_id: params.organizationId,
      conversation_id: conversationId,
      wa_message_id: params.waMessageId,
      external_message_id: params.waMessageId,
      channel: 'whatsapp',
      message_type: params.messageType ?? 'text',
      direction: 'inbound',
      body: params.body,
      media_url: params.mediaUrl ?? null,
      status: 'delivered',
      sent_at: params.sentAt,
    },
    { onConflict: 'organization_id,wa_message_id', ignoreDuplicates: true },
  );

  if (msgErr) {
    console.error('[WahaWebhook] failed to insert message', { error: msgErr.message, conversationId, waMessageId: params.waMessageId });
    return null;
  }

  return conversationId;
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
  const supabase = createStaticAdminClient();

  // Acumulador para webhook_logs
  const result: {
    event: string | null;
    session: string | null;
    inboundProcessed: number;
    inboundDropped: number;
    droppedReasons: string[];
    errors: string[];
    organizationIds: string[];
  } = {
    event: webhookBody.event ?? null,
    session: webhookBody.session ?? null,
    inboundProcessed: 0,
    inboundDropped: 0,
    droppedReasons: [],
    errors: [],
    organizationIds: [],
  };

  const writeLog = async (statusCode: number, errorMessage?: string) => {
    try {
      await supabase.from('webhook_logs').insert({
        organization_id: result.organizationIds[0] ?? null,
        source: 'waha',
        method: 'POST',
        status_code: statusCode,
        payload: webhookBody as unknown as Record<string, unknown>,
        result: result as unknown as Record<string, unknown>,
        error_message: errorMessage ?? null,
      });
    } catch (e) {
      console.error('[WahaWebhook] failed to write webhook_log', e);
    }
  };

  const { event, payload, session } = webhookBody;

  // Ignorar eventos que não são mensagens novas
  if (event !== 'message') {
    result.droppedReasons.push(`event_not_message:${event ?? 'null'}`);
    await writeLog(200, `event != message`);
    return NextResponse.json({ ok: true, ignored: true, event });
  }

  // Ignorar mensagens enviadas pelo próprio CRM (eco do nosso outbound)
  if (payload?.fromMe === true) {
    result.droppedReasons.push('from_me');
    await writeLog(200, 'fromMe = true');
    return NextResponse.json({ ok: true, ignored: true, reason: 'from_me' });
  }

  // WAHA GOWS engine usa LID no campo `from` (ex: "270205083242639@lid").
  // O telefone real fica em `_data.Info.SenderAlt` (ex: "5516991370740@s.whatsapp.net").
  const fromRaw = payload ? extractRealPhone(payload) : '';
  const messageId = payload?.id ?? '';
  const body = payload?.body ?? '';
  const timestamp = payload?.timestamp ?? Date.now() / 1000;
  const sentAt = new Date(timestamp * 1000).toISOString();

  if (!fromRaw) {
    result.droppedReasons.push('missing_from');
    await writeLog(422, 'missing from');
    return NextResponse.json({ error: 'Missing from field' }, { status: 422 });
  }

  // Resolver org via session name (waha_config.sessionName)
  const resolved = await resolveWahaConfigBySession(supabase, session ?? null);

  if (!resolved?.organizationId) {
    console.warn('[WahaWebhook] inbound dropped — session has no org', { session });
    result.inboundDropped += 1;
    result.droppedReasons.push(`no_org_for_session:${session ?? 'null'}`);
    await writeLog(200, `no org for session=${session}`);
    return NextResponse.json({ ok: true, dropped: true, reason: 'no_org_for_session' });
  }

  const organizationId = resolved.organizationId;
  const wahaApiKey = resolved.apiKey;
  const wahaBaseUrl = resolved.baseUrl;
  result.organizationIds.push(organizationId);

  const normalizedPhone = normalizeWahaPhone(fromRaw);

  // Buscar contato (sem bloquear) e deal ativo (para automação opcional)
  const contactId = await findContactByPhone(supabase, organizationId, normalizedPhone);
  const dealMatch = contactId
    ? await findActiveDealForContact(supabase, organizationId, contactId)
    : null;

  // Se a mensagem tem mídia, baixa e rehospeda no bucket conversation-attachments.
  // WAHA self-hosted serve o arquivo no próprio servidor e exige `x-api-key` —
  // sem isso o fetch retorna 401/HTML e o arquivo no bucket fica inválido
  // (imagem/audio aparecem quebrados no front).
  let messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'file' = 'text';
  let mediaUrl: string | null = null;
  const sourceMediaUrl = payload?.media?.url || payload?.mediaUrl;
  if (payload?.hasMedia && sourceMediaUrl) {
    // Só anexa x-api-key quando a URL é do próprio servidor WAHA — evita vazar
    // a chave em redirects/CDNs externas (lookaside etc).
    const isWahaInternalUrl = !!wahaBaseUrl && sourceMediaUrl.startsWith(wahaBaseUrl);
    const rehostHeaders = isWahaInternalUrl && wahaApiKey
      ? { 'x-api-key': wahaApiKey }
      : undefined;

    const rehosted = await rehostInboundMedia(supabase, {
      sourceUrl: sourceMediaUrl,
      organizationId,
      mimetype: payload?.media?.mimetype,
      filenameHint: payload?.media?.filename ?? undefined,
      headers: rehostHeaders,
    });
    if (rehosted) {
      mediaUrl = rehosted.publicUrl;
      messageType = rehosted.mediaType;
    } else {
      console.warn('[WahaWebhook] rehost falhou — guardando URL original', {
        url: sourceMediaUrl.slice(0, 100),
        hasApiKey: !!wahaApiKey,
        isWahaInternalUrl,
      });
      mediaUrl = sourceMediaUrl;
      messageType = payload?.media?.mimetype ? categorizeMime(payload.media.mimetype) : 'file';
    }
  }

  // Persistir SEMPRE — não deixar cair só porque não tem deal
  const conversationId = await persistInboundMessage(supabase, {
    organizationId,
    contactId,
    dealId: dealMatch?.dealId ?? null,
    phoneDigits: normalizedPhone,
    waMessageId: messageId || `${normalizedPhone}-${timestamp}`,
    body,
    sentAt,
    messageType,
    mediaUrl,
  });

  if (!conversationId) {
    result.inboundDropped += 1;
    result.droppedReasons.push('persist_failed');
    result.errors.push(`persist failed for ${normalizedPhone}/${messageId}`);
    await writeLog(500, 'persist failed');
    return NextResponse.json({ error: 'Persist failed' }, { status: 500 });
  }

  result.inboundProcessed += 1;

  console.log('[WahaWebhook] inbound persisted', {
    conversationId,
    contactId,
    dealId: dealMatch?.dealId ?? null,
    phone: normalizedPhone,
    session,
  });

  // Automação só dispara se houver deal vinculado
  if (dealMatch) {
    await onResponseReceived(dealMatch);
  }

  // Super Agente em background
  if (body) {
    void processWithSuperAgent(supabase, {
      organizationId,
      conversationId,
      contactPhone: normalizedPhone,
      inboundMessage: body,
    }).catch((e) => console.error('[WahaWebhook] Super Agent error:', e));
  }

  await writeLog(200);
  return NextResponse.json({ ok: true, conversationId, dealMatched: !!dealMatch });
}
