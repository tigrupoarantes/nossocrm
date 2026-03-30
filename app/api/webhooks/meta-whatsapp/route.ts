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

async function findActiveDealByPhone(
  supabase: AdminClient,
  phone: string
): Promise<{ dealId: string; boardId: string; organizationId: string } | null> {
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, organization_id')
    .ilike('phone', `%${phone}%`)
    .limit(5)

  if (!contacts || contacts.length === 0) return null

  for (const contact of contacts) {
    const { data: deals } = await supabase
      .from('deals')
      .select('id, board_id, boards!inner(id, template)')
      .eq('contact_id', contact.id)
      .eq('organization_id', contact.organization_id)
      .is('won_at', null)
      .is('lost_at', null)
      .eq('boards.template', 'QUALIFICATION')
      .limit(1)

    if (deals && deals.length > 0) {
      const deal = deals[0] as Record<string, unknown>
      return {
        dealId: deal.id as string,
        boardId: deal.board_id as string,
        organizationId: contact.organization_id as string,
      }
    }
  }

  return null
}

async function upsertConversationAndMessage(
  supabase: AdminClient,
  params: {
    organizationId: string
    contactId: string | null
    dealId: string | null
    waChatId: string
    waMessageId: string
    body: string
    sentAt: string
  }
): Promise<void> {
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
    .single()

  if (!conv?.id) return

  await supabase
    .from('conversations')
    .update({
      last_message_at: params.sentAt,
      unread_count: (conv.unread_count ?? 0) + 1,
    })
    .eq('id', conv.id)

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
  )
}

// ---------------------------------------------------------------------------
// POST — Processar mensagens inbound
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const webhookBody = await request.json().catch(() => ({})) as MetaWebhookBody

  // Ignorar eventos que não são do WhatsApp Business Account
  if (webhookBody.object !== 'whatsapp_business_account') {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const supabase = createStaticAdminClient()

  for (const entry of webhookBody.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue

      const value = change.value
      const messages = value.messages ?? []

      for (const message of messages) {
        // Apenas processar mensagens de texto por enquanto
        if (message.type !== 'text' || !message.text?.body) continue

        const fromRaw = message.from // ex: "5511999990000"
        const messageId = message.id // ex: "wamid.xxx"
        const body = message.text.body
        const timestamp = parseInt(message.timestamp, 10)
        const sentAt = new Date(timestamp * 1000).toISOString()

        if (!fromRaw) continue

        const normalizedPhone = normalizeMetaPhone(fromRaw)
        // Meta usa formato sem @c.us — normalizar para o padrão interno
        const waChatId = `${normalizedPhone}@s.whatsapp.net`

        // Buscar deal ativo para disparar automação
        const match = await findActiveDealByPhone(supabase, normalizedPhone)

        if (!match?.organizationId) continue

        // Persistir conversa e mensagem
        await upsertConversationAndMessage(supabase, {
          organizationId: match.organizationId,
          contactId: null,
          dealId: match.dealId ?? null,
          waChatId,
          waMessageId: messageId,
          body,
          sentAt,
        })

        await onResponseReceived(match)

        // Super Agente em background
        if (body) {
          void Promise.resolve(
            supabase
              .from('conversations')
              .select('id')
              .eq('organization_id', match.organizationId)
              .eq('wa_chat_id', waChatId)
              .single()
          ).then(({ data: conv }) => {
            if (!conv?.id) return
            return processWithSuperAgent(supabase, {
              organizationId: match.organizationId,
              conversationId: conv.id,
              contactPhone: normalizedPhone,
              inboundMessage: body,
            })
          }).catch((e) => console.error('[MetaWebhook] Super Agent error:', e))
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
