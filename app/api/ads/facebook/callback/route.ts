/**
 * app/api/ads/facebook/callback/route.ts
 * OAuth callback do Facebook para conectar conta de anúncios.
 * Troca o code pelo access_token e salva a conta de anúncio.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const FB_API_VERSION = 'v21.0'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  if (error) {
    console.error('[FB OAuth] Error:', error, errorDescription)
    return NextResponse.redirect(
      new URL(`/ads?error=${encodeURIComponent(errorDescription ?? error)}`, req.url)
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/ads?error=missing_code', req.url))
  }

  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.redirect(new URL('/ads?error=profile_not_found', req.url))
    }

    // Trocar code por access_token
    const appId = process.env.FACEBOOK_APP_ID
    const appSecret = process.env.FACEBOOK_APP_SECRET
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/ads/facebook/callback`

    if (!appId || !appSecret) {
      return NextResponse.redirect(new URL('/ads?error=facebook_not_configured', req.url))
    }

    const tokenUrl = new URL(`https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`)
    tokenUrl.searchParams.set('client_id', appId)
    tokenUrl.searchParams.set('redirect_uri', redirectUri)
    tokenUrl.searchParams.set('client_secret', appSecret)
    tokenUrl.searchParams.set('code', code)

    const tokenRes = await fetch(tokenUrl.toString())
    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('[FB OAuth] Token exchange failed:', err)
      return NextResponse.redirect(new URL('/ads?error=token_exchange_failed', req.url))
    }

    const tokenData = await tokenRes.json() as {
      access_token: string
      token_type: string
      expires_in?: number
    }

    const accessToken = tokenData.access_token

    // Buscar contas de anúncio do usuário
    const meUrl = new URL(`https://graph.facebook.com/${FB_API_VERSION}/me/adaccounts`)
    meUrl.searchParams.set('access_token', accessToken)
    meUrl.searchParams.set('fields', 'id,name,account_status,currency')
    meUrl.searchParams.set('limit', '50')

    const meRes = await fetch(meUrl.toString())
    const meData = await meRes.json() as {
      data?: Array<{ id: string; name: string; account_status: number }>
    }

    const accounts = meData.data ?? []

    // Salvar a primeira conta ativa (ou todas)
    for (const account of accounts.filter((a) => a.account_status === 1)) {
      // Remove prefixo "act_"
      const cleanAccountId = account.id.replace('act_', '')

      await supabase.from('ad_accounts').upsert(
        {
          organization_id: profile.organization_id,
          platform: 'facebook',
          account_id: cleanAccountId,
          account_name: account.name,
          access_token: accessToken,
          is_active: true,
          config: { currency: 'BRL', timezone: 'America/Sao_Paulo' },
        },
        { onConflict: 'organization_id,platform,account_id' }
      )
    }

    return NextResponse.redirect(new URL('/ads?connected=true', req.url))
  } catch (err) {
    console.error('[FB OAuth] Unexpected error:', err)
    return NextResponse.redirect(new URL('/ads?error=unexpected', req.url))
  }
}
