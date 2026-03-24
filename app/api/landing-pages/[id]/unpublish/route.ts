/**
 * POST /api/landing-pages/[id]/unpublish
 * Reverte uma landing page publicada para rascunho.
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

  const { data, error } = await supabase
    .from('landing_pages')
    .update({ status: 'draft', published_at: null })
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
