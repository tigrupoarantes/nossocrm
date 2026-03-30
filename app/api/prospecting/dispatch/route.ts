/**
 * POST /api/prospecting/dispatch
 * Inicia disparo de mensagens para uma campanha de prospecção.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const DispatchSchema = z.object({
  campaignId: z.string().uuid(),
  messageTemplate: z.string().min(1),
  delaySeconds: z.number().min(10).max(3600).default(120),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.organization_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = DispatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const { campaignId, messageTemplate, delaySeconds } = parsed.data

  // Verificar que campanha pertence à org
  const { data: campaign } = await supabase
    .from('prospecting_campaigns')
    .select('id, status, total_leads')
    .eq('id', campaignId)
    .eq('organization_id', profile.organization_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  // Criar registros de disparo para todos os leads da campanha
  const { data: leads } = await supabase
    .from('prospecting_leads')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('status', 'new')

  if (!leads || leads.length === 0) {
    return NextResponse.json({ error: 'No new leads to dispatch' }, { status: 422 })
  }

  const dispatches = leads.map((lead) => ({
    campaign_id: campaignId,
    organization_id: profile.organization_id,
    lead_id: lead.id,
    channel: 'whatsapp',
    message_template: messageTemplate,
    status: 'pending',
  }))

  await supabase.from('prospecting_dispatches').insert(dispatches)

  // Atualizar status da campanha
  await supabase
    .from('prospecting_campaigns')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', campaignId)

  // Processar primeiro lote em background
  const { processPendingDispatches } = await import('@/lib/prospecting/dispatcher')
  processPendingDispatches({
    campaignId,
    organizationId: profile.organization_id,
    messageTemplate,
    delayBetweenMs: delaySeconds * 1000,
    maxPerRun: 10,
  }).catch((e) => console.error('[Dispatch] Error:', e))

  return NextResponse.json({
    ok: true,
    totalToDispatch: leads.length,
    delaySeconds,
  })
}

/**
 * GET /api/prospecting/dispatch?campaignId=xxx
 * Retorna progresso do disparo.
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  const url = new URL(req.url)
  const campaignId = url.searchParams.get('campaignId')
  if (!campaignId) return NextResponse.json({ error: 'Missing campaignId' }, { status: 400 })

  const [campaignRes, statsRes] = await Promise.all([
    supabase
      .from('prospecting_campaigns')
      .select('status, total_leads, leads_contacted')
      .eq('id', campaignId)
      .eq('organization_id', profile?.organization_id)
      .single(),
    supabase
      .from('prospecting_dispatches')
      .select('status')
      .eq('campaign_id', campaignId),
  ])

  const statuses = (statsRes.data ?? []).map((d) => d.status)
  const stats = {
    pending: statuses.filter((s) => s === 'pending').length,
    sent: statuses.filter((s) => s === 'sent').length,
    delivered: statuses.filter((s) => s === 'delivered').length,
    replied: statuses.filter((s) => s === 'replied').length,
    failed: statuses.filter((s) => s === 'failed').length,
  }

  return NextResponse.json({
    campaign: campaignRes.data,
    stats,
  })
}
