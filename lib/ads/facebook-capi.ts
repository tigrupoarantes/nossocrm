/**
 * lib/ads/facebook-capi.ts
 * Facebook Conversions API (CAPI) — eventos server-side para rastreamento.
 * Envia eventos de conversão diretamente do servidor, sem depender de cookies/pixel.
 */

import crypto from 'crypto'

const FB_API_VERSION = 'v21.0'

export type CAPIEventName =
  | 'Lead'
  | 'Purchase'
  | 'ViewContent'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'Contact'
  | 'CompleteRegistration'
  | 'Schedule'

export interface CAPIUserData {
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
  city?: string
  state?: string
  country?: string
  zipCode?: string
  externalId?: string
  clientIpAddress?: string
  clientUserAgent?: string
  fbp?: string    // Facebook browser ID cookie (_fbp)
  fbc?: string    // Facebook click ID cookie (_fbc)
}

export interface CAPICustomData {
  value?: number
  currency?: string
  contentName?: string
  contentCategory?: string
  contentIds?: string[]
  orderId?: string
  status?: string
  leadId?: string
  campaignId?: string
}

export interface CAPIEvent {
  eventName: CAPIEventName
  eventTime?: number          // Unix timestamp (default: now)
  eventId?: string            // Dedup ID
  eventSourceUrl?: string
  userData: CAPIUserData
  customData?: CAPICustomData
  testEventCode?: string
}

export interface CAPIConfig {
  pixelId: string
  accessToken: string
  testEventCode?: string
}

/**
 * Normaliza (hash SHA-256) dados PII do usuário conforme exigido pelo CAPI.
 */
function hashPII(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

/**
 * Constrói o objeto user_data com campos hasheados para o CAPI.
 */
function buildUserData(userData: CAPIUserData): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  if (userData.email) result.em = [hashPII(userData.email)]
  if (userData.phone) {
    // Normaliza: apenas dígitos, prefixo 55 (Brasil)
    const digits = userData.phone.replace(/\D/g, '')
    const normalized = digits.startsWith('55') ? digits : `55${digits}`
    result.ph = [hashPII(normalized)]
  }
  if (userData.firstName) result.fn = [hashPII(userData.firstName)]
  if (userData.lastName) result.ln = [hashPII(userData.lastName)]
  if (userData.city) result.ct = [hashPII(userData.city)]
  if (userData.state) result.st = [hashPII(userData.state)]
  if (userData.country) result.country = [hashPII(userData.country || 'br')]
  if (userData.zipCode) result.zp = [hashPII(userData.zipCode.replace(/\D/g, ''))]
  if (userData.externalId) result.external_id = [hashPII(userData.externalId)]

  // Estes não são hasheados
  if (userData.clientIpAddress) result.client_ip_address = userData.clientIpAddress
  if (userData.clientUserAgent) result.client_user_agent = userData.clientUserAgent
  if (userData.fbp) result.fbp = userData.fbp
  if (userData.fbc) result.fbc = userData.fbc

  return result
}

/**
 * Envia um evento via Facebook Conversions API.
 */
export async function sendCAPIEvent(
  config: CAPIConfig,
  event: CAPIEvent
): Promise<{ success: boolean; eventId: string; error?: string }> {
  const eventId = event.eventId ?? crypto.randomUUID()
  const eventTime = event.eventTime ?? Math.floor(Date.now() / 1000)

  const payload = {
    data: [
      {
        event_name: event.eventName,
        event_time: eventTime,
        event_id: eventId,
        event_source_url: event.eventSourceUrl,
        action_source: 'system_generated',
        user_data: buildUserData(event.userData),
        custom_data: event.customData
          ? {
              value: event.customData.value,
              currency: event.customData.currency ?? 'BRL',
              content_name: event.customData.contentName,
              content_category: event.customData.contentCategory,
              content_ids: event.customData.contentIds,
              order_id: event.customData.orderId,
              status: event.customData.status,
              lead_id: event.customData.leadId,
            }
          : undefined,
      },
    ],
    ...(event.testEventCode || config.testEventCode
      ? { test_event_code: event.testEventCode ?? config.testEventCode }
      : {}),
  }

  const url = `https://graph.facebook.com/${FB_API_VERSION}/${config.pixelId}/events?access_token=${config.accessToken}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { success: false, eventId, error: `CAPI error ${res.status}: ${errText}` }
    }

    return { success: true, eventId }
  } catch (err) {
    return { success: false, eventId, error: String(err) }
  }
}

/**
 * Envia evento de Lead (novo lead gerado).
 */
export async function sendLeadEvent(
  config: CAPIConfig,
  userData: CAPIUserData,
  meta?: { campaignId?: string; leadId?: string; value?: number }
): Promise<{ success: boolean; eventId: string; error?: string }> {
  return sendCAPIEvent(config, {
    eventName: 'Lead',
    userData,
    customData: {
      currency: 'BRL',
      value: meta?.value ?? 0,
      campaignId: meta?.campaignId,
      leadId: meta?.leadId,
    },
  })
}

/**
 * Envia evento de Purchase (deal ganho).
 */
export async function sendPurchaseEvent(
  config: CAPIConfig,
  userData: CAPIUserData,
  value: number,
  meta?: { orderId?: string; contentName?: string }
): Promise<{ success: boolean; eventId: string; error?: string }> {
  return sendCAPIEvent(config, {
    eventName: 'Purchase',
    userData,
    customData: {
      value,
      currency: 'BRL',
      orderId: meta?.orderId,
      contentName: meta?.contentName,
    },
  })
}

/**
 * Envia evento de Contact (contato inicial).
 */
export async function sendContactEvent(
  config: CAPIConfig,
  userData: CAPIUserData
): Promise<{ success: boolean; eventId: string; error?: string }> {
  return sendCAPIEvent(config, {
    eventName: 'Contact',
    userData,
  })
}

/**
 * Envia evento de Schedule (agendamento realizado).
 */
export async function sendScheduleEvent(
  config: CAPIConfig,
  userData: CAPIUserData,
  meta?: { contentName?: string }
): Promise<{ success: boolean; eventId: string; error?: string }> {
  return sendCAPIEvent(config, {
    eventName: 'Schedule',
    userData,
    customData: meta,
  })
}
