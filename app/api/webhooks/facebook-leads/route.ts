/**
 * app/api/webhooks/facebook-leads/route.ts
 * Webhook para receber leads de Formulários do Facebook.
 * Facebook envia POST com leadgen entries quando um lead preenche um form.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient'

const APP_SECRET = process.env.FACEBOOK_APP_SECRET ?? ''
const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN ?? ''

/**
 * Verifica assinatura HMAC-SHA256 da requisição Facebook.
 */
function verifySignature(body: string, signature: string): boolean {
  if (!APP_SECRET) return true // Skip em dev sem secret
  const expected = `sha256=${crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex')}`
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

/**
 * GET — Verificação do webhook pelo Facebook.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/**
 * POST — Recebe notificações de leads e converte em contatos/leads no CRM.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256') ?? ''

  if (signature && !verifySignature(rawBody, signature)) {
    console.warn('[FBLeads] Assinatura inválida')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: {
    object?: string
    entry?: Array<{
      id: string
      changes?: Array<{
        value?: {
          form_id?: string
          leadgen_id?: string
          ad_id?: string
          adgroup_id?: string
          created_time?: number
          page_id?: string
        }
        field?: string
      }>
    }>
  }

  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (payload.object !== 'page' && payload.object !== 'ad_account') {
    return NextResponse.json({ status: 'ignored' })
  }

  const supabase = createStaticAdminClient()

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue

      const value = change.value
      if (!value?.leadgen_id) continue

      try {
        // Buscar detalhes do lead via Graph API
        // O lead detail requer que a ad_account tenha access_token
        // Procurar qual org tem este ad_account
        if (value.ad_id) {
          const { data: adCampaign } = await supabase
            .from('ad_campaigns')
            .select('organization_id, id, ad_account_id')
            .eq('external_id', value.adgroup_id ?? value.ad_id ?? '')
            .maybeSingle()

          const orgId = adCampaign?.organization_id ?? null

          // Registrar evento de lead
          if (orgId) {
            await supabase.from('ad_lead_events').insert({
              organization_id: orgId,
              campaign_id: adCampaign?.id ?? null,
              event_type: 'lead',
              source: 'form',
              event_data: {
                leadgen_id: value.leadgen_id,
                form_id: value.form_id,
                ad_id: value.ad_id,
                adgroup_id: value.adgroup_id,
                page_id: value.page_id,
                created_time: value.created_time,
              },
            })
          }
        }
      } catch (err) {
        console.error('[FBLeads] Error processing lead:', value.leadgen_id, err)
      }
    }
  }

  return NextResponse.json({ status: 'ok' })
}
