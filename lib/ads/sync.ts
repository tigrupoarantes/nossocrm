/**
 * lib/ads/sync.ts
 * Sincronizador de campanhas e insights do Facebook/Google Ads.
 * Chamado por cron ou trigger manual para atualizar métricas.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchCampaigns, fetchCampaignInsights } from './facebook'

export interface SyncResult {
  adAccountId: string
  platform: string
  accountId: string
  campaignsSynced: number
  errors: string[]
  syncedAt: string
}

/**
 * Sincroniza campanhas e insights de uma conta de anúncio Facebook.
 */
async function syncFacebookAccount(
  supabase: SupabaseClient,
  adAccount: {
    id: string
    organization_id: string
    account_id: string
    access_token: string
    config: Record<string, unknown>
  },
  datePreset = 'last_30d'
): Promise<SyncResult> {
  const result: SyncResult = {
    adAccountId: adAccount.id,
    platform: 'facebook',
    accountId: adAccount.account_id,
    campaignsSynced: 0,
    errors: [],
    syncedAt: new Date().toISOString(),
  }

  try {
    // Buscar campanhas
    const campaigns = await fetchCampaigns(adAccount.account_id, adAccount.access_token)

    // Buscar insights
    const insights = await fetchCampaignInsights(adAccount.account_id, adAccount.access_token, datePreset)

    // Criar map de insights por campaign_id
    const insightMap = new Map(insights.map((i) => [i.campaignId, i]))

    // Upsert de campanhas
    for (const campaign of campaigns) {
      const insight = insightMap.get(campaign.id)

      const { error } = await supabase
        .from('ad_campaigns')
        .upsert(
          {
            organization_id: adAccount.organization_id,
            ad_account_id: adAccount.id,
            external_id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            objective: campaign.objective,
            budget_daily: campaign.dailyBudget,
            budget_lifetime: campaign.lifetimeBudget,
            date_start: campaign.startTime ? campaign.startTime.split('T')[0] : null,
            date_end: campaign.stopTime ? campaign.stopTime.split('T')[0] : null,
            // Métricas de insights
            spend: insight?.spend ?? 0,
            impressions: insight?.impressions ?? 0,
            clicks: insight?.clicks ?? 0,
            leads: insight?.leads ?? 0,
            cpl: insight?.cpl ?? null,
            ctr: insight?.ctr ?? null,
            synced_at: new Date().toISOString(),
            metadata: { raw_campaign: campaign, raw_insight: insight ?? null },
          },
          { onConflict: 'ad_account_id,external_id' }
        )

      if (error) {
        result.errors.push(`Campaign ${campaign.id}: ${error.message}`)
      } else {
        result.campaignsSynced++
      }
    }

    // Atualizar last_sync_at da conta
    await supabase
      .from('ad_accounts')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', adAccount.id)

  } catch (err) {
    result.errors.push(`Fatal: ${String(err)}`)
  }

  return result
}

/**
 * Sincroniza todas as contas de anúncio ativas de uma organização.
 */
export async function syncOrganizationAds(
  supabase: SupabaseClient,
  organizationId: string,
  datePreset = 'last_30d'
): Promise<SyncResult[]> {
  const { data: adAccounts, error } = await supabase
    .from('ad_accounts')
    .select('id, organization_id, platform, account_id, access_token, config')
    .eq('organization_id', organizationId)
    .eq('is_active', true)

  if (error || !adAccounts || adAccounts.length === 0) {
    return []
  }

  const results: SyncResult[] = []

  for (const account of adAccounts) {
    if (!account.access_token) continue

    if (account.platform === 'facebook') {
      const result = await syncFacebookAccount(supabase, account, datePreset)
      results.push(result)
    }
    // Google/TikTok: futura implementação
  }

  return results
}

/**
 * Sincroniza todas as contas ativas no sistema (para cron global).
 */
export async function syncAllAdAccounts(
  supabase: SupabaseClient,
  datePreset = 'last_30d'
): Promise<SyncResult[]> {
  const { data: adAccounts, error } = await supabase
    .from('ad_accounts')
    .select('id, organization_id, platform, account_id, access_token, config')
    .eq('is_active', true)
    .not('access_token', 'is', null)

  if (error || !adAccounts || adAccounts.length === 0) {
    return []
  }

  const results: SyncResult[] = []

  for (const account of adAccounts) {
    if (account.platform === 'facebook') {
      const result = await syncFacebookAccount(supabase, account, datePreset)
      results.push(result)
    }
  }

  return results
}
