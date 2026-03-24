/**
 * GET /p/[slug]
 * Serve a landing page publicada como documento HTML completo,
 * sem nenhum wrapper do Next.js (resolve o bug de estilos quebrados).
 */

import { NextResponse } from 'next/server';
import { createStaticAdminClient } from '@/lib/supabase/server';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = createStaticAdminClient();

  const { data: lp } = await supabase
    .from('landing_pages')
    .select('id, html_content, views_count')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (!lp) {
    return new NextResponse('Página não encontrada', { status: 404 });
  }

  // Incrementa views em background (fire-and-forget)
  supabase
    .from('landing_pages')
    .update({ views_count: (lp.views_count ?? 0) + 1 })
    .eq('id', lp.id)
    .then(() => {});

  return new NextResponse(lp.html_content, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
