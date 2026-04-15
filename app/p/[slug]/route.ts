/**
 * GET /p/[slug]
 * Serve a landing page publicada como documento HTML completo,
 * sem nenhum wrapper do Next.js (resolve o bug de estilos quebrados).
 */

import { NextResponse } from 'next/server';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { postProcessHtml } from '@/features/landing-pages/lib/html-postprocess';
import { resolveSlugPlaceholder } from '@/features/landing-pages/lib/html-import';

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

  // Garante tokens/Tailwind/fonts/motion injetados — idempotente, serve também
  // pra LPs antigas geradas antes do post-processador. Resolve placeholder
  // de slug usado em LPs importadas (ex: Lovable).
  const html = resolveSlugPlaceholder(
    postProcessHtml(lp.html_content ?? ''),
    slug
  );

  // CSP relaxada apenas para landing pages públicas: a IA gera imagens de
  // CDNs variados (picsum, unsplash, placeholder, etc.) e a CSP global
  // bloqueia tudo, poluindo o console. Mantém script/style controlados.
  const lpCsp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src * data: blob:",
    "connect-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': lpCsp,
    },
  });
}
