/**
 * Rota pública para renderizar landing pages.
 * Acessível sem autenticação em /p/{slug}
 */

import { notFound } from 'next/navigation';
import { createStaticAdminClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getLandingPage(slug: string) {
  const supabase = createStaticAdminClient();
  const { data } = await supabase
    .from('landing_pages')
    .select('id, title, slug, html_content, meta_title, meta_description, og_image_url, views_count, organization_id')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();
  return data;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const lp = await getLandingPage(slug);
  if (!lp) return { title: 'Página não encontrada' };

  return {
    title: lp.meta_title || lp.title,
    description: lp.meta_description || undefined,
    openGraph: {
      title: lp.meta_title || lp.title,
      description: lp.meta_description || undefined,
      images: lp.og_image_url ? [lp.og_image_url] : undefined,
    },
  };
}

export default async function LandingPagePublicPage({ params }: PageProps) {
  const { slug } = await params;
  const lp = await getLandingPage(slug);

  if (!lp) notFound();

  // Incrementar views em background (fire-and-forget)
  const supabase = createStaticAdminClient();
  supabase
    .from('landing_pages')
    .update({ views_count: (lp.views_count ?? 0) + 1 })
    .eq('id', lp.id)
    .then(() => {});

  return (
    <div
      style={{ margin: 0, padding: 0, minHeight: '100vh' }}
      dangerouslySetInnerHTML={{ __html: lp.html_content }}
    />
  );
}
