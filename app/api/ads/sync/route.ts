/**
 * app/api/ads/sync/route.ts
 * Trigger manual de sincronização de campanhas de anúncios.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncOrganizationAds } from '@/lib/ads/sync'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const datePreset = body.datePreset ?? 'last_30d'

    const results = await syncOrganizationAds(supabase, profile.organization_id, datePreset)

    const totalCampaigns = results.reduce((acc, r) => acc + r.campaignsSynced, 0)
    const totalErrors = results.flatMap((r) => r.errors)

    return NextResponse.json({
      success: true,
      accounts: results.length,
      campaignsSynced: totalCampaigns,
      errors: totalErrors,
      syncedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[AdsSync]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    const { data: adAccounts } = await supabase
      .from('ad_accounts')
      .select('id, platform, account_name, account_id, is_active, last_sync_at')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ adAccounts: adAccounts ?? [] })
  } catch (err) {
    console.error('[AdsSync GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
