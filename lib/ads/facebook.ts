/**
 * lib/ads/facebook.ts
 * Facebook Marketing API client — campanhas, insights e sincronização.
 */

const FB_API_VERSION = 'v21.0'
const FB_BASE = `https://graph.facebook.com/${FB_API_VERSION}`

export interface FacebookCampaign {
  id: string
  name: string
  status: string
  objective: string
  dailyBudget: number | null
  lifetimeBudget: number | null
  startTime: string | null
  stopTime: string | null
}

export interface FacebookInsights {
  campaignId: string
  spend: number
  impressions: number
  clicks: number
  leads: number
  cpl: number | null
  ctr: number | null
  dateStart: string
  dateStop: string
}

/**
 * Busca todas as campanhas de uma conta de anúncio.
 */
export async function fetchCampaigns(
  adAccountId: string,
  accessToken: string
): Promise<FacebookCampaign[]> {
  const url = new URL(`${FB_BASE}/act_${adAccountId}/campaigns`)
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('fields', 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time')
  url.searchParams.set('limit', '100')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Facebook API error: ${res.status}`)

  const data = await res.json() as {
    data: Array<{
      id: string
      name: string
      status: string
      objective: string
      daily_budget?: string
      lifetime_budget?: string
      start_time?: string
      stop_time?: string
    }>
  }

  return (data.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    objective: c.objective,
    dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
    lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
    startTime: c.start_time ?? null,
    stopTime: c.stop_time ?? null,
  }))
}

/**
 * Busca insights de campanhas (métricas de performance).
 */
export async function fetchCampaignInsights(
  adAccountId: string,
  accessToken: string,
  datePreset = 'last_30d'
): Promise<FacebookInsights[]> {
  const url = new URL(`${FB_BASE}/act_${adAccountId}/insights`)
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('fields', 'campaign_id,campaign_name,spend,impressions,clicks,actions,ctr,date_start,date_stop')
  url.searchParams.set('level', 'campaign')
  url.searchParams.set('date_preset', datePreset)
  url.searchParams.set('limit', '100')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Facebook Insights error: ${res.status}`)

  const data = await res.json() as {
    data: Array<{
      campaign_id: string
      spend: string
      impressions: string
      clicks: string
      actions?: Array<{ action_type: string; value: string }>
      ctr?: string
      date_start: string
      date_stop: string
    }>
  }

  return (data.data ?? []).map((insight) => {
    const leads = insight.actions?.find((a) => a.action_type === 'lead')?.value ?? '0'
    const spend = Number(insight.spend) || 0
    const leadsNum = Number(leads) || 0
    return {
      campaignId: insight.campaign_id,
      spend,
      impressions: Number(insight.impressions) || 0,
      clicks: Number(insight.clicks) || 0,
      leads: leadsNum,
      cpl: leadsNum > 0 ? spend / leadsNum : null,
      ctr: insight.ctr ? Number(insight.ctr) : null,
      dateStart: insight.date_start,
      dateStop: insight.date_stop,
    }
  })
}

/**
 * Gera URL de OAuth do Facebook para autorização.
 */
export function buildFacebookOAuthUrl(
  appId: string,
  redirectUri: string,
  state: string
): string {
  const url = new URL('https://www.facebook.com/dialog/oauth')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', 'ads_read,ads_management,leads_retrieval,pages_read_engagement')
  url.searchParams.set('response_type', 'code')
  return url.toString()
}
