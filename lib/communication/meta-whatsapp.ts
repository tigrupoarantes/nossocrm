/**
 * lib/communication/meta-whatsapp.ts
 *
 * Adapter para a API Oficial da Meta (WhatsApp Cloud API).
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Configuração necessária em organization_settings.meta_whatsapp_config:
 * {
 *   phoneNumberId: string   — ID do número de telefone no Meta Business
 *   accessToken: string     — Token de acesso permanente (System User)
 *   businessAccountId?: string
 *   webhookVerifyToken?: string — Token para verificação do webhook
 *   appSecret?: string      — App Secret para validar assinatura HMAC do webhook
 * }
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// Versão atual estável da Meta Cloud API (dezembro/2024).
const META_API_VERSION = 'v22.0'
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`

// =============================================================================
// Types
// =============================================================================

export interface MetaWhatsAppConfig {
  phoneNumberId: string
  accessToken: string
  businessAccountId?: string
  webhookVerifyToken?: string
  appSecret?: string
}

export interface MetaSendResult {
  success: boolean
  messageId?: string
  error?: string
}

export interface MetaTestResult {
  ok: boolean
  phoneNumber?: string
  displayPhoneNumber?: string
  error?: string
}

// Templates de mensagem (mesmo formato do Twilio adapter)
const WA_TEMPLATES: Record<string, (vars: { contactName: string }) => string> = {
  'primeiro-contato': ({ contactName }) =>
    `Olá, ${contactName}! 👋\n\nEspero que esteja bem! Gostaria de saber se teria interesse em conversar.\n\nPodemos ajudar sua empresa a crescer. Tem 15 minutinhos esta semana? 😊`,
  'lembrete': ({ contactName }) =>
    `Olá, ${contactName}! 👋\n\nPassando para ver se recebeu nossa mensagem anterior. Estamos à disposição para uma conversa rápida quando for conveniente para você. 🚀`,
}

function renderTemplate(templateId: string, vars: { contactName: string }): string {
  const template = WA_TEMPLATES[templateId]
  if (!template) throw new Error(`WhatsApp template not found: ${templateId}`)
  return template(vars)
}

// =============================================================================
// Normalização de número
// =============================================================================

/**
 * Normaliza número de telefone para formato E.164 sem o "+".
 * Meta Cloud API aceita números sem "+", apenas dígitos.
 * Ex: "+55 11 99999-0000" → "5511999990000"
 */
export function normalizeMetaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  // Garante DDI 55 (Brasil) se não estiver presente
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }
  return digits
}

// =============================================================================
// Envio de mensagem
// =============================================================================

/**
 * Envia mensagem de texto via Meta WhatsApp Cloud API.
 */
export async function sendMetaMessage(
  config: MetaWhatsAppConfig,
  to: string,
  body: string
): Promise<MetaSendResult> {
  try {
    const phone = normalizeMetaPhone(to)

    const res = await fetch(`${META_GRAPH_URL}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { preview_url: false, body },
      }),
    })

    const data = await res.json() as {
      messages?: Array<{ id: string }>
      error?: { message: string; code: number }
    }

    if (!res.ok || data.error) {
      return {
        success: false,
        error: data.error?.message ?? `Meta API error: ${res.status}`,
      }
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// =============================================================================
// Envio de automação
// =============================================================================

/**
 * Envia mensagem de automação para o contato de um deal via Meta Cloud API.
 * Persiste a mensagem no banco de dados.
 */
export async function sendAutomationMeta(
  supabase: SupabaseClient,
  organizationId: string,
  config: MetaWhatsAppConfig,
  contactPhone: string,
  templateId: string,
  vars: { contactName: string }
): Promise<void> {
  const body = renderTemplate(templateId, vars)
  const result = await sendMetaMessage(config, contactPhone, body)

  if (!result.success) {
    console.error('[MetaWhatsApp] Automation send failed:', result.error)
    return
  }

  // Persistir no banco (upsert conversa + mensagem)
  // IMPORTANTE: usar @c.us para casar com o formato usado pelo outbound
  // (app/api/deals/[id]/conversations/route.ts) e pelo webhook inbound.
  const normalizedPhone = normalizeMetaPhone(contactPhone)
  const waChatId = `${normalizedPhone}@c.us`
  const sentAt = new Date().toISOString()

  const { data: conv } = await supabase
    .from('conversations')
    .upsert(
      {
        organization_id: organizationId,
        wa_chat_id: waChatId,
        channel: 'whatsapp',
        last_message_at: sentAt,
        unread_count: 0,
      },
      { onConflict: 'organization_id,wa_chat_id', ignoreDuplicates: false }
    )
    .select('id')
    .single()

  if (conv?.id) {
    await supabase.from('messages').upsert(
      {
        organization_id: organizationId,
        conversation_id: conv.id,
        wa_message_id: result.messageId ?? `meta-${Date.now()}`,
        direction: 'outbound',
        body,
        status: 'sent',
        sent_at: sentAt,
      },
      { onConflict: 'organization_id,wa_message_id', ignoreDuplicates: true }
    )
  }
}

// =============================================================================
// Teste de credenciais
// =============================================================================

/**
 * Testa as credenciais Meta consultando as informações do Phone Number ID.
 */
export async function testMetaCredentials(config: MetaWhatsAppConfig): Promise<MetaTestResult> {
  try {
    const res = await fetch(
      `${META_GRAPH_URL}/${config.phoneNumberId}?fields=display_phone_number,verified_name`,
      {
        headers: { 'Authorization': `Bearer ${config.accessToken}` },
      }
    )

    const data = await res.json() as {
      display_phone_number?: string
      verified_name?: string
      error?: { message: string }
    }

    if (!res.ok || data.error) {
      return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` }
    }

    return {
      ok: true,
      phoneNumber: data.verified_name,
      displayPhoneNumber: data.display_phone_number,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
