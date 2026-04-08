/**
 * @fileoverview Meta WhatsApp Cloud API — Webhook Inbound
 *
 * Recebe eventos do WhatsApp via Meta Cloud API.
 *
 * GET  — Verificação do webhook pela Meta (hub.challenge)
 * POST — Mensagens inbound + status updates
 *
 * Configuração na Meta for Developers:
 *   Webhook URL: https://crm.grupoarantes.emp.br/api/webhooks/meta-whatsapp
 *   Verify Token: (valor de meta_whatsapp_config.webhookVerifyToken)
 *   Subscribed fields: messages
 *
 * Segurança: valida X-Hub-Signature-256 com HMAC-SHA256 do app_secret.
 */

import { NextResponse } from 'next/server'
import { createStaticAdminClient } from '@/lib/supabase/server'
import { onResponseReceived } from '@/lib/automation/triggers'
import { processWithSuperAgent } from '@/lib/ai/super-agent/engine'

export const runtime = 'nodejs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetaWebhookEntry {
  id: string
  changes: Array<{
    value: {
      messaging_product: string
      metadata: { display_phone_number: string; phone_number_id: string }
      contacts?: Array<{ profile: { name: string }; wa_id: string }>
      messages?: Array<{
        from: string
        id: string
        timestamp: string
        text?: { body: string }
        type: string
      }>
      statuses?: Array<{
        id: string
        status: string
        timestamp: string
        recipient_id: string
      }>
    }
    field: string
  }>
}

interface MetaWebhookBody {
  object?: string
  entry?: MetaWebhookEntry[]
}

// ---------------------------------------------------------------------------
// GET — Verificação do webhook
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode !== 'subscribe' || !token || !challenge) {
    return NextResponse.json({ error: 'Invalid verification request' }, { status: 400 })
  }

  // Verificar se o token corresponde a alguma organização configurada
  const supabase = createStaticAdminClient()
  const { data: settings } = await supabase
    .from('organization_settings')
    .select('meta_whatsapp_config')
    .not('meta_whatsapp_config', 'is', null)

  const isValid = settings?.some((s: Record<string, unknown>) => {
    const config = s.meta_whatsapp_config as Record<string, string> | null
    return config?.webhookVerifyToken === token
  })

  if (!isValid) {
    // Fallback: aceitar token de env var global
    const globalToken = process.env.META_WEBHOOK_VERIFY_TOKEN
    if (!globalToken || globalToken !== token) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Retornar challenge como texto puro (obrigatório pela Meta)
  return new Response(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normaliza número do formato Meta (apenas dígitos, ex: "5511999990000")
 * para o formato interno do CRM (apenas dígitos sem prefixo).
 */
function normalizeMetaPhone(from: string): string {
  return from.replace(/\D/g, '')
}

type AdminClient = ReturnType<typeof createStaticAdminClient>

/**
 * Resolve a organização dona deste número Meta (phone_number_id) lendo
 * organization_settings.meta_whatsapp_config. Usado como fallback quando
 * não conseguimos resolver via deal ativo.
 */
async function resolveOrganizationByPhoneNumberId(
  supabase: AdminClient,
  phoneNumberId: string | null | undefined
): Promise<string | null> {
  if (!phoneNumberId) return null
  const { data } = await supabase
    .from('organization_settings')
    .select('organization_id, meta_whatsapp_config')
    .not('meta_whatsapp_config', 'is', null)

  const match = data?.find((row) => {
    const cfg = (row as Record<string, unknown>).meta_whatsapp_config as
      | { phoneNumberId?: string }
      | null
    return cfg?.phoneNumberId === phoneNumberId
  })
  return (match as Record<string, unknown> | undefined)?.organization_id as string | null ?? null
}

async function findContactByPhone(
  supabase: AdminClient,
  organizationId: string,
  phone: string
): Promise<string | null> {
  const { data } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', organizationId)
    .ilike('phone', `%${phone}%`)
    .limit(1)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/**
 * Procura um deal QUALIFICATION ativo para esse contato dentro da org.
 * Usado para disparar automação onResponseReceived. Não bloqueia a
 * persistência da mensagem se retornar null.
 */
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
    .limit(1)

  if (!deals || deals.length === 0) return null
  const deal = deals[0] as Record<string, unknown>
  return {
    dealId: deal.id as string,
    boardId: deal.board_id as string,
    organizationId,
  }
}

/**
 * Busca defensiva por conversa existente. Tenta primeiro o formato canônico
 * (@c.us) e cai para o legado (@s.whatsapp.net) caso a migration ainda não
 * tenha sido aplicada. Retorna o id e o wa_chat_id encontrado.
 */
async function findExistingConversation(
  supabase: AdminClient,
  organizationId: string,
  phoneDigits: string,
): Promise<{ id: string; wa_chat_id: string } | null> {
  const candidates = [`${phoneDigits}@c.us`, `${phoneDigits}@s.whatsapp.net`]
  for (const candidate of candidates) {
    const { data } = await supabase
      .from('conversations')
      .select('id, wa_chat_id')
      .eq('organization_id', organizationId)
      .eq('wa_chat_id', candidate)
      .maybeSingle()
    if (data?.id) {
      return { id: data.id as string, wa_chat_id: data.wa_chat_id as string }
    }
  }
  return null
}

async function persistInboundMessage(
  supabase: AdminClient,
  params: {
    organizationId: string
    contactId: string | null
    dealId: string | null
    phoneDigits: string
    waMessageId: string
    body: string
    sentAt: string
  }
): Promise<string | null> {
  // 1) Tenta achar conversa existente em qualquer formato (defensivo).
  const existing = await findExistingConversation(
    supabase,
    params.organizationId,
    params.phoneDigits,
  )

  let conversationId: string

  if (existing) {
    conversationId = existing.id
    // Atualiza last_message_at + incrementa unread_count
    const { data: convCurrent } = await supabase
      .from('conversations')
      .select('unread_count')
      .eq('id', conversationId)
      .single()
    await supabase
      .from('conversations')
      .update({
        last_message_at: params.sentAt,
        unread_count: ((convCurrent?.unread_count as number | null) ?? 0) + 1,
        // Vincula contato/deal se ainda não estiverem
        ...(params.contactId ? { contact_id: params.contactId } : {}),
        ...(params.dealId ? { deal_id: params.dealId } : {}),
      })
      .eq('id', conversationId)
  } else {
    // 2) Cria nova conversa em formato canônico @c.us
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
      .single()

    if (createErr || !newConv?.id) {
      console.error('[MetaWebhook] failed to create conversation', { error: createErr?.message, phone: params.phoneDigits })
      return null
    }
    conversationId = newConv.id as string
  }

  // 3) Insere a mensagem (idempotente via external_message_id)
  const { error: msgErr } = await supabase.from('messages').upsert(
    {
      organization_id: params.organizationId,
      conversation_id: conversationId,
      wa_message_id: params.waMessageId,
      external_message_id: params.waMessageId,
      channel: 'whatsapp',
      message_type: 'text',
      direction: 'inbound',
      body: params.body,
      status: 'delivered',
      sent_at: params.sentAt,
    },
    { onConflict: 'organization_id,external_message_id', ignoreDuplicates: true }
  )

  if (msgErr) {
    console.error('[MetaWebhook] failed to insert message', { error: msgErr.message, conversationId })
  }

  return conversationId
}

/**
 * Atualiza o status de uma mensagem outbound a partir de um status update
 * da Meta (sent / delivered / read / failed). Idempotente.
 */
async function applyStatusUpdate(
  supabase: AdminClient,
  params: { externalMessageId: string; status: string }
): Promise<void> {
  // Mapeia status da Meta para o domínio interno
  const allowed = new Set(['sent', 'delivered', 'read', 'failed'])
  if (!allowed.has(params.status)) return

  const { error } = await supabase
    .from('messages')
    .update({ status: params.status })
    .eq('external_message_id', params.externalMessageId)

  if (error) {
    console.error('[MetaWebhook] status update failed', { error: error.message, ...params })
  }
}

// ---------------------------------------------------------------------------
// POST — Processar mensagens inbound
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const webhookBody = await request.json().catch(() => ({})) as MetaWebhookBody

  const supabase = createStaticAdminClient()

  // Acumulador de resultado para registrar no webhook_logs no final.
  const result: {
    object: string | null
    statusUpdates: number
    inboundProcessed: number
    inboundDropped: number
    droppedReasons: string[]
    errors: string[]
    organizationIds: string[]
  } = {
    object: webhookBody.object ?? null,
    statusUpdates: 0,
    inboundProcessed: 0,
    inboundDropped: 0,
    droppedReasons: [],
    errors: [],
    organizationIds: [],
  }

  // Helper para SEMPRE gravar o log (chamado em todos os return paths).
  const writeLog = async (statusCode: number, errorMessage?: string) => {
    try {
      await supabase.from('webhook_logs').insert({
        organization_id: result.organizationIds[0] ?? null,
        source: 'meta-whatsapp',
        method: 'POST',
        status_code: statusCode,
        payload: webhookBody as unknown as Record<string, unknown>,
        result: result as unknown as Record<string, unknown>,
        error_message: errorMessage ?? null,
      })
    } catch (e) {
      console.error('[MetaWebhook] failed to write webhook_log', e)
    }
  }

  // Ignorar eventos que não são do WhatsApp Business Account
  if (webhookBody.object !== 'whatsapp_business_account') {
    result.droppedReasons.push('object_not_whatsapp_business_account')
    await writeLog(200, 'object != whatsapp_business_account')
    return NextResponse.json({ ok: true, ignored: true })
  }

  console.log('[MetaWebhook] POST received', {
    entries: webhookBody.entry?.length ?? 0,
  })

  for (const entry of webhookBody.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue

      const value = change.value
      const phoneNumberId = value.metadata?.phone_number_id ?? null

      // -------------------------------------------------------------------
      // (A) Status updates (delivered / read / failed) — ✓ ✓✓ ✓✓ azul
      // -------------------------------------------------------------------
      const statuses = value.statuses ?? []
      if (statuses.length > 0) {
        console.log('[MetaWebhook] processing statuses', { count: statuses.length })
        for (const status of statuses) {
          if (!status.id || !status.status) continue
          await applyStatusUpdate(supabase, {
            externalMessageId: status.id,
            status: status.status,
          })
          result.statusUpdates += 1
        }
      }

      // -------------------------------------------------------------------
      // (B) Inbound messages
      // -------------------------------------------------------------------
      const messages = value.messages ?? []
      if (messages.length === 0) continue

      // Resolver org UMA vez por change (todas as messages do mesmo
      // phone_number_id). Mais barato e mais correto que por mensagem.
      const organizationId = await resolveOrganizationByPhoneNumberId(
        supabase,
        phoneNumberId,
      )

      if (!organizationId) {
        console.warn('[MetaWebhook] inbound dropped — phone_number_id has no org', {
          phoneNumberId,
          messageCount: messages.length,
        })
        result.inboundDropped += messages.length
        result.droppedReasons.push(`no_org_for_phone_number_id:${phoneNumberId ?? 'null'}`)
        continue
      }

      if (!result.organizationIds.includes(organizationId)) {
        result.organizationIds.push(organizationId)
      }

      for (const message of messages) {
        // Por enquanto só processamos texto. Mídia entra na próxima rodada.
        if (message.type !== 'text' || !message.text?.body) {
          console.log('[MetaWebhook] skipping non-text message', { type: message.type, id: message.id })
          result.inboundDropped += 1
          result.droppedReasons.push(`unsupported_type:${message.type}`)
          continue
        }

        const fromRaw = message.from
        const messageId = message.id
        const body = message.text.body
        const timestamp = parseInt(message.timestamp, 10)
        const sentAt = new Date(timestamp * 1000).toISOString()

        if (!fromRaw) {
          result.inboundDropped += 1
          result.droppedReasons.push('missing_from')
          continue
        }

        const normalizedPhone = normalizeMetaPhone(fromRaw)

        // Procurar contato e (opcional) deal ativo nesta org.
        const contactId = await findContactByPhone(supabase, organizationId, normalizedPhone)
        const dealMatch = contactId
          ? await findActiveDealForContact(supabase, organizationId, contactId)
          : null

        const conversationId = await persistInboundMessage(supabase, {
          organizationId,
          contactId,
          dealId: dealMatch?.dealId ?? null,
          phoneDigits: normalizedPhone,
          waMessageId: messageId,
          body,
          sentAt,
        })

        if (!conversationId) {
          console.error('[MetaWebhook] persist failed', { phone: normalizedPhone, messageId })
          result.inboundDropped += 1
          result.droppedReasons.push('persist_failed')
          result.errors.push(`persist failed for ${normalizedPhone}/${messageId}`)
          continue
        }

        console.log('[MetaWebhook] inbound persisted', {
          conversationId,
          contactId,
          dealId: dealMatch?.dealId ?? null,
          phone: normalizedPhone,
        })

        result.inboundProcessed += 1

        // Automação só dispara se houver deal vinculado.
        if (dealMatch) {
          await onResponseReceived(dealMatch)
        }

        // Super Agente em background.
        void processWithSuperAgent(supabase, {
          organizationId,
          conversationId,
          contactPhone: normalizedPhone,
          inboundMessage: body,
        }).catch((e) => console.error('[MetaWebhook] Super Agent error:', e))
      }
    }
  }

  await writeLog(200)

  return NextResponse.json({ ok: true })
}
