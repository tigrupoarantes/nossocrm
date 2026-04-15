/**
 * POST /api/landing-pages/import
 *
 * Recebe HTML externo (ex: exportado do Lovable) e cria uma landing page
 * nova com status=draft. Injeta no primeiro <form> encontrado o handler
 * de captura que submete para /api/p/[slug]/submit com a webhook_api_key
 * da LP.
 *
 * Body: { html: string; title: string }
 * Resposta: { data: { id, slug }, warnings?: string[] }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateSlug } from '@/features/landing-pages/lib/slug-utils';
import { postProcessHtml } from '@/features/landing-pages/lib/html-postprocess';
import {
  analyzeImportedHtml,
  injectFormHandler,
  normalizeFieldNames,
} from '@/features/landing-pages/lib/html-import';

export const runtime = 'nodejs';

const MAX_HTML_SIZE = 2_000_000; // 2MB

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

  const body = await request.json().catch(() => null) as { html?: string; title?: string } | null;
  if (!body?.html || !body?.title) {
    return NextResponse.json({ error: 'html e title são obrigatórios' }, { status: 400 });
  }

  if (body.html.length > MAX_HTML_SIZE) {
    return NextResponse.json(
      { error: 'HTML excede 2MB. Reduza imagens embutidas antes de importar.' },
      { status: 413 }
    );
  }

  if (!body.html.includes('</html>')) {
    return NextResponse.json(
      { error: 'HTML inválido: não foi encontrado </html>.' },
      { status: 422 }
    );
  }

  // Análise antes de persistir (warnings para o cliente decidir se ajusta).
  const analysis = analyzeImportedHtml(body.html);

  // Normaliza names de input comuns antes de injetar o handler.
  const normalized = normalizeFieldNames(body.html);

  const slug = generateSlug(body.title);

  // 1. Cria a LP com HTML temporário (placeholder). Precisamos primeiro da
  // webhook_api_key gerada por default no DB para só então injetar o script.
  const { data: created, error: insertError } = await supabase
    .from('landing_pages')
    .insert({
      organization_id: profile.organization_id,
      title: body.title,
      slug,
      html_content: normalized,
      status: 'draft',
      source: 'imported_html',
      thank_you_message: 'Obrigado! Entraremos em contato em breve.',
      created_by: user.id,
    })
    .select('id, slug, webhook_api_key')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: 'Slug já existe. Edite o título e tente novamente.' }, { status: 409 });
    }
    // O campo `source` pode não existir no schema — tentar sem ele.
    if (insertError.code === '42703') {
      const retry = await supabase
        .from('landing_pages')
        .insert({
          organization_id: profile.organization_id,
          title: body.title,
          slug,
          html_content: normalized,
          status: 'draft',
          thank_you_message: 'Obrigado! Entraremos em contato em breve.',
          created_by: user.id,
        })
        .select('id, slug, webhook_api_key')
        .single();
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 500 });
      }
      return finalize(supabase, retry.data, normalized, analysis.warnings);
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return finalize(supabase, created, normalized, analysis.warnings);
}

async function finalize(
  supabase: Awaited<ReturnType<typeof createClient>>,
  created: { id: string; slug: string; webhook_api_key: string },
  normalizedHtml: string,
  warnings: string[]
) {
  // 2. Injeta o handler de captura com a api_key real + postProcess para
  // garantir Tailwind/fonts/motion.
  const withHandler = injectFormHandler(normalizedHtml, created.webhook_api_key);
  const finalHtml = postProcessHtml(withHandler);

  // 3. Update do html_content com a versão final.
  const { error: updateError } = await supabase
    .from('landing_pages')
    .update({ html_content: finalHtml })
    .eq('id', created.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      data: { id: created.id, slug: created.slug },
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    { status: 201 }
  );
}
