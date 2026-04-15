/**
 * POST /api/prospecting/search
 * Busca leads via Google Places e salva na campanha.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { searchGooglePlaces } from '@/lib/prospecting/sources/google-places'

const SearchSchema = z.object({
  segment: z.string().min(1),
  city: z.string().min(1),
  campaignName: z.string().optional(),
  maxResults: z.number().min(1).max(100).default(20),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  if (!profile?.organization_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const parsed = SearchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 })

  const { segment, city, campaignName, maxResults } = parsed.data
  const orgId = profile.organization_id

  // 1. Criar campanha
  const { data: campaign, error: campaignError } = await supabase
    .from('prospecting_campaigns')
    .insert({
      organization_id: orgId,
      name: campaignName || `${segment} em ${city}`,
      segment,
      city,
      status: 'running',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }

  // 2. Buscar leads no Google Places
  const places = await searchGooglePlaces({ segment, city, maxResults })

  // 3. Salvar leads
  if (places.length > 0) {
    const leadsToInsert = places.map((p) => ({
      campaign_id: campaign.id,
      organization_id: orgId,
      business_name: p.businessName,
      phone: p.phone,
      address: p.address,
      segment,
      city,
      source: 'google_places',
      metadata: { rating: p.rating, place_id: p.placeId },
    }))

    await supabase.from('prospecting_leads').insert(leadsToInsert)
  }

  // 4. Atualizar campanha com total de leads
  await supabase
    .from('prospecting_campaigns')
    .update({ total_leads: places.length, status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', campaign.id)

  const leadsWithPhone = places.filter((p) => p.phone).length

  return NextResponse.json({
    campaignId: campaign.id,
    totalLeads: places.length,
    leadsWithPhone,
    leadsWithoutPhone: places.length - leadsWithPhone,
    leads: places,
  })
}
