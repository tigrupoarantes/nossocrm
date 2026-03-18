/**
 * GET  /api/landing-pages  — Lista landing pages da organização
 * POST /api/landing-pages  — Cria nova landing page (status=draft)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateSlug } from '@/features/landing-pages/lib/slug-utils';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') ?? '0', 10);
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '20', 10), 100);
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('landing_pages')
    .select('id, title, slug, status, views_count, submissions_count, published_at, created_at, updated_at', { count: 'exact' })
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [], totalCount: count ?? 0 });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }
  if (!['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const slug = body.slug || generateSlug(body.title);

  const { data, error } = await supabase
    .from('landing_pages')
    .insert({
      organization_id: profile.organization_id,
      title: body.title,
      slug,
      description: body.description ?? null,
      html_content: body.htmlContent ?? '',
      prompt_used: body.promptUsed ?? null,
      ai_model: body.aiModel ?? null,
      target_board_id: body.targetBoardId ?? null,
      target_stage_id: body.targetStageId ?? null,
      custom_fields: body.customFields ?? [],
      thank_you_message: body.thankYouMessage ?? 'Obrigado! Entraremos em contato em breve.',
      thank_you_redirect_url: body.thankYouRedirectUrl ?? null,
      meta_title: body.metaTitle ?? null,
      meta_description: body.metaDescription ?? null,
      status: 'draft',
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Slug já existe. Escolha outro.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
