/**
 * GET /api/landing-pages/[id]/submissions/export
 * Exporta todas as submissões (leads) de uma landing page em CSV.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stringifyCsv, withUtf8Bom } from '@/lib/utils/csv'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  // Validar que a LP pertence à org
  const { data: lp } = await supabase
    .from('landing_pages')
    .select('id, title, slug')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single()

  if (!lp) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Buscar todas submissions (chunked para LPs com muitos leads)
  const chunkSize = 1000
  let page = 0
  const allSubmissions: Array<Record<string, unknown>> = []

  while (true) {
    const from = page * chunkSize
    const to = from + chunkSize - 1

    const { data, error } = await supabase
      .from('landing_page_submissions')
      .select(
        'id, form_data, utm_source, utm_medium, utm_campaign, utm_term, utm_content, created_at, contacts(id, name, email), deals(id, title)'
      )
      .eq('landing_page_id', id)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break

    allSubmissions.push(...data)
    if (data.length < chunkSize) break
    page++
  }

  // Montar CSV
  const header = ['Nome', 'Email', 'Telefone', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Term', 'UTM Content', 'Deal', 'Data']

  const rows = allSubmissions.map((sub) => {
    const fd = (sub.form_data ?? {}) as Record<string, string>
    const contact = sub.contacts as { name?: string; email?: string } | null
    const deal = sub.deals as { title?: string } | null

    const name = fd.name || fd.nome || contact?.name || ''
    const email = fd.email || contact?.email || ''
    const phone = fd.phone || fd.telefone || fd.whatsapp || ''

    return [
      name,
      email,
      phone,
      (sub.utm_source as string) || '',
      (sub.utm_medium as string) || '',
      (sub.utm_campaign as string) || '',
      (sub.utm_term as string) || '',
      (sub.utm_content as string) || '',
      deal?.title || '',
      sub.created_at ? new Date(sub.created_at as string).toLocaleDateString('pt-BR') : '',
    ]
  })

  const csv = withUtf8Bom(stringifyCsv([header, ...rows], ';'))
  const today = new Date().toISOString().slice(0, 10)
  const filename = `leads-${lp.slug || 'lp'}-${today}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
