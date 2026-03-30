/**
 * lib/prospecting/dispatcher.ts
 * Motor de disparo de mensagens de prospecção com rate limiting e delay configurável.
 */
import { createStaticAdminClient } from '@/lib/supabase/server'

export interface DispatchOptions {
  campaignId: string
  organizationId: string
  messageTemplate: string
  delayBetweenMs?: number  // default 120_000 (2 min)
  maxPerRun?: number        // default 50
}

export interface DispatchProgress {
  total: number
  sent: number
  failed: number
  remaining: number
  isRunning: boolean
}

/**
 * Substitui variáveis no template de mensagem.
 * Suporta: {nome}, {empresa}, {cidade}, {segmento}
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | null>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

/**
 * Processa um lote de disparos pendentes para a campanha.
 * Chamado pela Edge Function ou por um endpoint de cron.
 */
export async function processPendingDispatches(options: DispatchOptions): Promise<DispatchProgress> {
  const sb = createStaticAdminClient()
  const delayMs = options.delayBetweenMs ?? 120_000
  const maxPerRun = options.maxPerRun ?? 50

  // Buscar disparos pendentes
  const { data: pending } = await sb
    .from('prospecting_dispatches')
    .select('id, lead_id')
    .eq('campaign_id', options.campaignId)
    .eq('status', 'pending')
    .limit(maxPerRun)

  if (!pending || pending.length === 0) {
    return { total: 0, sent: 0, failed: 0, remaining: 0, isRunning: false }
  }

  // Buscar config WAHA da org
  const { data: orgSettings } = await sb
    .from('organization_settings')
    .select('waha_config')
    .eq('organization_id', options.organizationId)
    .single()

  const wahaConfig = (orgSettings as Record<string, unknown>)?.waha_config as
    | { baseUrl: string; apiKey: string; sessionName: string }
    | null

  let sent = 0
  let failed = 0

  for (const dispatch of pending) {
    try {
      // Buscar dados do lead
      const { data: lead } = await sb
        .from('prospecting_leads')
        .select('business_name, phone, city, segment')
        .eq('id', dispatch.lead_id)
        .single()

      if (!lead?.phone) {
        await markDispatch(sb, dispatch.id, 'failed', 'Sem telefone')
        failed++
        continue
      }

      // Renderizar mensagem
      const body = renderTemplate(options.messageTemplate, {
        nome: lead.business_name ?? '',
        empresa: lead.business_name ?? '',
        cidade: lead.city ?? '',
        segmento: lead.segment ?? '',
      })

      // Enviar via WAHA
      if (wahaConfig?.baseUrl) {
        const { sendWahaMessage } = await import('@/lib/communication/waha')
        await sendWahaMessage({ to: lead.phone, body, wahaConfig })
      }

      await markDispatch(sb, dispatch.id, 'sent')
      await updateLeadStatus(sb, dispatch.lead_id, 'contacted')
      sent++

      // Delay entre envios
      if (sent < pending.length) {
        await new Promise((r) => setTimeout(r, delayMs))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await markDispatch(sb, dispatch.id, 'failed', msg)
      failed++
    }
  }

  // Contar restantes
  const { count: remaining } = await sb
    .from('prospecting_dispatches')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', options.campaignId)
    .eq('status', 'pending')

  // Atualizar status da campanha
  const isComplete = (remaining ?? 0) === 0
  if (isComplete) {
    await sb
      .from('prospecting_campaigns')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', options.campaignId)
  }

  return {
    total: pending.length,
    sent,
    failed,
    remaining: remaining ?? 0,
    isRunning: !isComplete,
  }
}

async function markDispatch(
  sb: ReturnType<typeof createStaticAdminClient>,
  dispatchId: string,
  status: string,
  errorMessage?: string
) {
  await sb
    .from('prospecting_dispatches')
    .update({
      status,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      error_message: errorMessage ?? null,
    })
    .eq('id', dispatchId)
}

async function updateLeadStatus(
  sb: ReturnType<typeof createStaticAdminClient>,
  leadId: string,
  status: string
) {
  await sb.from('prospecting_leads').update({ status }).eq('id', leadId)
}
