/**
 * POST /api/landing-pages/[id]/publish
 * Publica uma landing page (status: draft → published).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  if (!['admin', 'manager'].includes(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: lp } = await supabase
    .from('landing_pages')
    .select('id, html_content, status')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!lp) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!lp.html_content?.trim()) {
    return NextResponse.json({ error: 'Landing page sem conteúdo. Gere o HTML antes de publicar.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('landing_pages')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .select('id, slug, status, published_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
