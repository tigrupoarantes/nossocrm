/**
 * POST /api/p/[slug]/submit
 *
 * Rota PÚBLICA para receber submissão de formulário de landing page.
 * Autenticada por x-api-key (webhook_api_key da landing_page).
 *
 * Fluxo:
 * 1. Buscar LP pelo slug (admin client, sem auth de usuário)
 * 2. Validar x-api-key contra lp.webhook_api_key
 * 3. Criar ou atualizar contato (match por email ou phone)
 * 4. Criar deal no target_board_id / target_stage_id (se configurado)
 * 5. Inserir landing_page_submission
 * 6. Retornar { ok: true, redirectUrl? }
 */

import { createStaticAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-api-key',
    },
  });
}

export async function POST(
  request: Request,
  _ctx: { params: Promise<{ slug: string }> }
) {
  const supabase = createStaticAdminClient();

  // 1. Validar API key (enviada pelo HTML gerado, única por LP)
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // 2. Buscar LP pela webhook_api_key — robusto a mudanças de slug pós-geração
  const { data: lp, error: lpError } = await supabase
    .from('landing_pages')
    .select('id, organization_id, webhook_api_key, target_board_id, target_stage_id, title, thank_you_redirect_url, status')
    .eq('webhook_api_key', apiKey)
    .eq('status', 'published')
    .single();

  if (lpError || !lp) {
    return json({ error: 'Landing page não encontrada.' }, 404);
  }

  // 3. Parsear body
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return json({ error: 'Body inválido' }, 400);
  }

  const formData: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === 'string') formData[k] = v;
  }

  const name: string = formData.name || formData.nome || '';
  const email: string = formData.email || '';
  const phone: string = formData.phone || formData.telefone || formData.whatsapp || '';

  // 4. Criar ou atualizar contato
  let contactId: string | null = null;

  if (email || phone) {
    // Tentar encontrar contato existente pelo email
    let existingId: string | null = null;

    if (email) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', lp.organization_id)
        .eq('email', email)
        .maybeSingle();
      existingId = existing?.id ?? null;
    }

    if (!existingId && phone) {
      const normalizedPhone = phone.replace(/\D/g, '');
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', lp.organization_id)
        .eq('phone', normalizedPhone)
        .maybeSingle();
      existingId = existing?.id ?? null;
    }

    if (existingId) {
      contactId = existingId;
    } else {
      const { data: newContact } = await supabase
        .from('contacts')
        .insert({
          organization_id: lp.organization_id,
          name: name || email || 'Lead',
          email: email || null,
          phone: phone ? phone.replace(/\D/g, '') : null,
          source: 'landing_page',
        })
        .select('id')
        .single();
      contactId = newContact?.id ?? null;
    }
  }

  // 5. Criar deal (se target_board_id configurado)
  let dealId: string | null = null;

  if (lp.target_board_id && contactId) {
    let stageId = lp.target_stage_id;

    // Se não tem stage configurado, usar o primeiro estágio do board
    if (!stageId) {
      const { data: stages } = await supabase
        .from('board_stages')
        .select('id')
        .eq('board_id', lp.target_board_id)
        .order('order', { ascending: true })
        .limit(1);
      stageId = stages?.[0]?.id ?? null;
    }

    if (stageId) {
      const { data: newDeal } = await supabase
        .from('deals')
        .insert({
          organization_id: lp.organization_id,
          title: `Lead — ${lp.title}`,
          contact_id: contactId,
          board_id: lp.target_board_id,
          stage_id: stageId,
          source: 'landing_page',
        })
        .select('id')
        .single();
      dealId = newDeal?.id ?? null;
    }
  }

  // 6. Registrar submissão
  const url = new URL(request.url);
  await supabase.from('landing_page_submissions').insert({
    organization_id: lp.organization_id,
    landing_page_id: lp.id,
    contact_id: contactId,
    deal_id: dealId,
    form_data: formData,
    utm_source: formData.utm_source ?? url.searchParams.get('utm_source') ?? null,
    utm_medium: formData.utm_medium ?? url.searchParams.get('utm_medium') ?? null,
    utm_campaign: formData.utm_campaign ?? url.searchParams.get('utm_campaign') ?? null,
    utm_term: formData.utm_term ?? url.searchParams.get('utm_term') ?? null,
    utm_content: formData.utm_content ?? url.searchParams.get('utm_content') ?? null,
    referrer: request.headers.get('referer') ?? null,
    user_agent: request.headers.get('user-agent') ?? null,
  });

  return json({
    ok: true,
    redirectUrl: lp.thank_you_redirect_url ?? null,
  });
}
