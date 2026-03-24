/**
 * GET    /api/landing-pages/[id]  — Buscar landing page por ID
 * PATCH  /api/landing-pages/[id]  — Atualizar landing page
 * DELETE /api/landing-pages/[id]  — Arquivar landing page
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function getOrgId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', userId)
    .single();
  return data;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getOrgId(supabase, user.id);
  if (!profile?.organization_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 });

  const { data, error } = await supabase
    .from('landing_pages')
    .select('*')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getOrgId(supabase, user.id);
  if (!profile?.organization_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  if (!['admin', 'manager'].includes(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));

  // Campos permitidos para update
  const allowed = [
    'title', 'slug', 'description', 'html_content', 'prompt_used', 'ai_model',
    'target_board_id', 'target_stage_id', 'custom_fields',
    'thank_you_message', 'thank_you_redirect_url',
    'meta_title', 'meta_description', 'og_image_url',
    'google_analytics_id', 'meta_pixel_id',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (body[camel] !== undefined) updates[key] = body[camel];
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('landing_pages')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Slug já existe.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getOrgId(supabase, user.id);
  if (!profile?.organization_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  if (!['admin', 'manager'].includes(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabase
    .from('landing_pages')
    .delete()
    .eq('id', id)
    .eq('organization_id', profile.organization_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
