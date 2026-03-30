/**
 * lib/dispatch/mass-sender.ts
 * Motor de envio em massa de mensagens WhatsApp com rate limiting e delay configurável.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface MassSendOptions {
  dispatchId: string
  organizationId: string
  delayMs?: number         // Delay entre envios (ms), default 120_000
  batchSize?: number       // Envios por lote antes de pausa, default 10
  onProgress?: (progress: MassSendProgress) => void
}

export interface MassSendProgress {
  dispatchId: string
  total: number
  sent: number
  failed: number
  skipped: number
  percent: number
  currentPhone?: string
}

/**
 * Substitui variáveis no template de mensagem.
 * Suporta: {nome}, {empresa}, {telefone}
 */
export function renderTemplate(
  template: string,
  vars: { nome?: string; empresa?: string; telefone?: string; [key: string]: string | undefined }
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match)
}

/**
 * Busca a instância WAHA ativa da organização.
 */
async function getActiveWAHAInstance(
  supabase: SupabaseClient,
  organizationId: string
): Promise<{ instanceName: string; wahaApiUrl: string; wahaApiKey: string } | null> {
  const { data } = await supabase
    .from('whatsapp_instances')
    .select('instance_name, waha_api_url, waha_api_key')
    .eq('organization_id', organizationId)
    .eq('status', 'WORKING')
    .limit(1)
    .maybeSingle()

  if (!data) return null

  return {
    instanceName: data.instance_name,
    wahaApiUrl: data.waha_api_url ?? process.env.WAHA_API_URL ?? '',
    wahaApiKey: data.waha_api_key ?? process.env.WAHA_API_KEY ?? '',
  }
}

/**
 * Envia uma mensagem via WAHA.
 */
async function sendWhatsAppMessage(
  wahaApiUrl: string,
  wahaApiKey: string,
  instanceName: string,
  phone: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Normaliza o número para formato WhatsApp
    const digits = phone.replace(/\D/g, '')
    const normalized = digits.startsWith('55') ? digits : `55${digits}`
    const chatId = `${normalized}@c.us`

    const res = await fetch(`${wahaApiUrl}/api/sendText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': wahaApiKey,
      },
      body: JSON.stringify({
        session: instanceName,
        chatId,
        text: message,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { success: false, error: `WAHA error ${res.status}: ${errText.slice(0, 200)}` }
    }

    const data = await res.json()
    return { success: true, messageId: data?.id ?? undefined }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Processa um disparo em massa, enviando mensagens com delay entre cada envio.
 */
export async function processMassDispatch(
  supabase: SupabaseClient,
  options: MassSendOptions
): Promise<MassSendProgress> {
  const {
    dispatchId,
    organizationId,
    delayMs = 120_000,
    batchSize = 10,
    onProgress,
  } = options

  // Buscar instância WAHA
  const waha = await getActiveWAHAInstance(supabase, organizationId)
  if (!waha) {
    await supabase
      .from('mass_dispatches')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', dispatchId)
    return { dispatchId, total: 0, sent: 0, failed: 0, skipped: 0, percent: 0 }
  }

  // Marcar disparo como running
  await supabase
    .from('mass_dispatches')
    .update({ status: 'running', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', dispatchId)

  // Buscar destinatários pendentes
  const { data: recipients } = await supabase
    .from('mass_dispatch_recipients')
    .select('id, phone, name, rendered_message')
    .eq('dispatch_id', dispatchId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const total = recipients?.length ?? 0
  let sent = 0
  let failed = 0
  let skipped = 0

  for (let i = 0; i < (recipients ?? []).length; i++) {
    const recipient = recipients![i]

    const message = recipient.rendered_message ?? ''
    if (!message.trim() || !recipient.phone) {
      // Marcar como skipped
      await supabase
        .from('mass_dispatch_recipients')
        .update({ status: 'skipped' })
        .eq('id', recipient.id)
      skipped++
      continue
    }

    const result = await sendWhatsAppMessage(
      waha.wahaApiUrl,
      waha.wahaApiKey,
      waha.instanceName,
      recipient.phone,
      message
    )

    if (result.success) {
      await supabase
        .from('mass_dispatch_recipients')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          waha_message_id: result.messageId ?? null,
        })
        .eq('id', recipient.id)
      sent++
    } else {
      await supabase
        .from('mass_dispatch_recipients')
        .update({
          status: 'failed',
          error_message: result.error ?? 'Unknown error',
        })
        .eq('id', recipient.id)
      failed++
    }

    // Atualizar contadores no disparo
    await supabase
      .from('mass_dispatches')
      .update({
        sent_count: sent,
        failed_count: failed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dispatchId)

    const progress: MassSendProgress = {
      dispatchId,
      total,
      sent,
      failed,
      skipped,
      percent: total > 0 ? Math.round(((sent + failed + skipped) / total) * 100) : 0,
      currentPhone: recipient.phone,
    }
    onProgress?.(progress)

    // Delay entre envios (exceto último)
    if (i < (recipients ?? []).length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  // Marcar disparo como concluído
  await supabase
    .from('mass_dispatches')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dispatchId)

  return { dispatchId, total, sent, failed, skipped, percent: 100 }
}
