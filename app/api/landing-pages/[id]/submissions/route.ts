/**
 * GET /api/landing-pages/[id]/submissions
 * Lista as submissões (leads capturados) de uma landing page.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 });

  // Validar que a LP pertence à org
  const { data: lp } = await supabase
    .from('landing_pages')
    .select('id')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!lp) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') ?? '0', 10);
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '50', 10), 100);
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('landing_page_submissions')
    .select(
      'id, form_data, utm_source, utm_medium, utm_campaign, created_at, contacts(id, name, email), deals(id, title)',
      { count: 'exact' }
    )
    .eq('landing_page_id', id)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], totalCount: count ?? 0 });
}
