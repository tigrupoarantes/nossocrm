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

import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { onResponseReceived } from '@/lib/automation/triggers';
import { processWithSuperAgent } from '@/lib/ai/super-agent/engine';
import { resolveWahaConfigBySession } from '@/lib/communication/meta-config-resolver';
import { rehostInboundMedia, categorizeMime } from '@/lib/communication/media-rehost';
import { normalizeWahaMessageId } from '@/lib/communication/waha';

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
 * Normaliza URL que pode vir sem scheme do payload WAHA. Algumas versões do
 * WAHA mandam `media.url` sem `https://` (ex: `host.com/api/files/x.jpeg`).
 * Sem isso, o browser do atendente interpreta como path relativo (→ 404 no
 * localhost) e o fetch no server não resolve.
 */
export function normalizeSourceUrl(raw: string, wahaBaseUrl: string | null | undefined): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  // Se a URL começa com "/", tenta resolver contra o wahaBaseUrl configurado.
  if (raw.startsWith('/') && wahaBaseUrl) {
    try {
      return new URL(raw, wahaBaseUrl).toString();
    } catch {
      // cai no default abaixo
    }
  }
  // Default: assume https://
  return `https://${raw.replace(/^\/+/, '')}`;
}

/**
 * Compara o host de duas URLs com tolerância a path/trailing-slash/scheme.
 * Retorna false se qualquer URL for inválida ou base ausente.
 */
export function isSameHost(targetUrl: string, baseUrl: string | null | undefined): boolean {
  if (!baseUrl) return false;
  try {
    return new URL(targetUrl).host === new URL(baseUrl).host;
  } catch {
    return false;
  }
}

/**
 * Mapeia o `ackName` do payload `message.ack` do WAHA para o enum interno de
 * `messages.status`. Convergimos READ e PLAYED em 'read' (UX igual WhatsApp Web).
 * Retorna null se o ackName não é reconhecido (ack ignorado).
 */
export function mapWahaAckToStatus(ackName?: string): 'sent' | 'delivered' | 'read' | 'failed' | null {
  switch ((ackName ?? '').toUpperCase()) {
    case 'SERVER': return 'sent';
    case 'DEVICE': return 'delivered';
    case 'READ':
    case 'PLAYED': return 'read';
    case 'ERROR': return 'failed';
    default: return null;
  }
}

/**
 * Ranking de status para evitar downgrade quando ACKs chegam fora de ordem
 * (ex: READ antes de DEVICE). 'failed' ignora o ranking — sempre prevalece.
 */
const STATUS_RANK: Record<string, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

/**
 * Valida assinatura HMAC-SHA512 do raw body do webhook contra o segredo
 * configurado em `WAHA_HMAC_SECRET`. WAHA Plus envia:
 *   X-Webhook-Hmac: <hex>
 *   X-Webhook-Hmac-Algorithm: sha512
 *
 * Retorna `true` se válido, `false` caso contrário. Comparação em tempo
 * constante (`timingSafeEqual`) — defesa contra timing attacks.
 */
export function validateHmacSha512(
  rawBody: string,
  signatureHex: string | null,
  algorithm: string | null,
  secret: string | null | undefined,
): boolean {
  if (!secret || !signatureHex) return false;
  if (algorithm && algorithm.toLowerCase() !== 'sha512') return false;

  const expected = createHmac('sha512', secret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signatureHex, 'hex');
  } catch {
    return false;
  }
  if (received.length !== expected.length) return false;
  return timingSafeEqual(expected, received);
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
  // Ler RAW body antes do parse — HMAC é calculado sobre os bytes literais.
  const rawBody = await request.text();

  // Sequência de autenticação:
  //  1. Se HMAC configurado E header presente → valida HMAC SHA-512 (forte).
  //  2. Senão → cai para `x-waha-secret` simples (legado, dev-friendly).
  const hmacSecret = process.env.WAHA_HMAC_SECRET ?? null;
  const hmacHeader = request.headers.get('x-webhook-hmac');
  const hmacAlgorithm = request.headers.get('x-webhook-hmac-algorithm');

  if (hmacSecret && hmacHeader) {
    if (!validateHmacSha512(rawBody, hmacHeader, hmacAlgorithm, hmacSecret)) {
      return NextResponse.json({ error: 'Unauthorized (HMAC mismatch)' }, { status: 401 });
    }
  } else {
    const secret = request.headers.get('x-waha-secret');
    if (!validateSecret(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let webhookBody: WahaWebhookBody;
  try {
    webhookBody = JSON.parse(rawBody) as WahaWebhookBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
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

  // Processar ACKs (delivered/read/played) — atualiza messages.status para que o
  // bubble outbound mostre ✓✓ azul (igual WhatsApp Web).
  if (event === 'message.ack') {
    const ackPayload = (payload ?? {}) as Record<string, unknown>;
    const ackMessageId = (ackPayload.id as string) || '';
    const ackName = (ackPayload.ackName as string) || '';
    const newStatus = mapWahaAckToStatus(ackName);

    if (!ackMessageId || !newStatus) {
      result.droppedReasons.push(`invalid_ack:${ackName || 'null'}`);
      await writeLog(200, `ack ignored (id=${ackMessageId} ackName=${ackName})`);
      return NextResponse.json({ ok: true, ignored: true, event, reason: 'invalid_ack' });
    }

    const resolvedAck = await resolveWahaConfigBySession(supabase, session ?? null);
    if (!resolvedAck?.organizationId) {
      result.inboundDropped += 1;
      result.droppedReasons.push(`no_org_for_session:${session ?? 'null'}`);
      await writeLog(200, `no org for ack session=${session}`);
      return NextResponse.json({ ok: true, dropped: true, reason: 'no_org_for_session' });
    }

    result.organizationIds.push(resolvedAck.organizationId);

    // GOWS envia ID no formato completo (`true_<chat>_<id>`); persistimos o
    // formato curto. Buscamos pelos dois (raw + normalizado) e em ambas as
    // colunas (external_message_id é o canônico para outbound; wa_message_id
    // é mirror desde a correção do send route + usado por inbound).
    const ackMessageIdShort = normalizeWahaMessageId(ackMessageId);
    const idCandidates = ackMessageIdShort && ackMessageIdShort !== ackMessageId
      ? [ackMessageIdShort, ackMessageId]
      : [ackMessageId];

    let current: { id: string; status: string } | null = null;
    for (const candidate of idCandidates) {
      const { data: byExt } = await supabase
        .from('messages')
        .select('id, status')
        .eq('organization_id', resolvedAck.organizationId)
        .eq('external_message_id', candidate)
        .limit(1)
        .maybeSingle();
      if (byExt?.id) {
        current = byExt as { id: string; status: string };
        break;
      }
      const { data: byWa } = await supabase
        .from('messages')
        .select('id, status')
        .eq('organization_id', resolvedAck.organizationId)
        .eq('wa_message_id', candidate)
        .limit(1)
        .maybeSingle();
      if (byWa?.id) {
        current = byWa as { id: string; status: string };
        break;
      }
    }

    if (!current?.id) {
      result.droppedReasons.push(`message_not_found:${ackMessageId}`);
      await writeLog(200, `message not found for ack: ${ackMessageId}`);
      return NextResponse.json({ ok: true, dropped: true, reason: 'message_not_found' });
    }

    // ACKs podem chegar fora de ordem (READ antes de DEVICE). Só fazemos upgrade —
    // 'failed' é exceção e sempre prevalece.
    const currentStatus = (current.status as string) || 'sending';
    const currentRank = STATUS_RANK[currentStatus] ?? 0;
    const newRank = STATUS_RANK[newStatus] ?? 0;

    if (newStatus !== 'failed' && newRank <= currentRank) {
      result.droppedReasons.push(`no_upgrade:${currentStatus}->${newStatus}`);
      await writeLog(200, `ack downgrade ignored (current=${currentStatus} new=${newStatus})`);
      return NextResponse.json({ ok: true, ignored: true, reason: 'no_upgrade' });
    }

    const { error: updErr } = await supabase
      .from('messages')
      .update({ status: newStatus })
      .eq('id', current.id as string);

    if (updErr) {
      result.errors.push(`ack update failed: ${updErr.message}`);
      await writeLog(500, `ack update failed: ${updErr.message}`);
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }

    result.inboundProcessed += 1;
    await writeLog(200);
    return NextResponse.json({ ok: true, messageId: current.id, status: newStatus });
  }

  // Aceitar tanto `message` quanto `message.any`. WAHA GOWS engine (>= 2026.4.x)
  // emite mensagens inbound apenas como `message.any` (superset de `message`,
  // payload idêntico). Filtragem de eco do próprio número fica por conta do
  // guard `fromMe === true` logo abaixo. Dedup por (organization_id,
  // wa_message_id) garante que se ambos os eventos chegarem, só persistimos um.
  if (event !== 'message' && event !== 'message.any') {
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
  const rawSourceMediaUrl = payload?.media?.url || payload?.mediaUrl;
  if (payload?.hasMedia && rawSourceMediaUrl) {
    // WAHA pode mandar URL sem scheme — normaliza ANTES de qualquer uso para
    // evitar que o browser do atendente trate como path relativo (404 em dev)
    // e que `new URL(...)` lance no isSameHost.
    const sourceMediaUrl = normalizeSourceUrl(rawSourceMediaUrl, wahaBaseUrl);

    // Só anexa x-api-key quando a URL aponta para o mesmo HOST do WAHA configurado
    // — evita vazar a chave em redirects/CDNs externas (lookaside etc). Comparar
    // por host (não `startsWith`) tolera diferenças de path/scheme/trailing-slash.
    const isWahaInternalUrl = isSameHost(sourceMediaUrl, wahaBaseUrl);
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
        rawUrl: rawSourceMediaUrl.slice(0, 120),
        normalizedUrl: sourceMediaUrl.slice(0, 120),
        wahaBaseUrl: wahaBaseUrl ?? null,
        hasApiKey: !!wahaApiKey,
        isWahaInternalUrl,
        mimetype: payload?.media?.mimetype ?? null,
      });
      // Salva a URL JÁ normalizada (com scheme) — nunca a raw sem scheme.
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
