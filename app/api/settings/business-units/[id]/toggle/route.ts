import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

/**
 * Handler HTTP `POST` deste endpoint (Next.js Route Handler).
 *
 * @param {Request} req - Objeto da requisição.
 * @param {{ params: Promise<{ id: string }> }} context - Contexto da rota.
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return json({ error: 'Profile not found' }, 404);
  }

  if (profile.role !== 'admin') {
    return json({ error: 'Forbidden' }, 403);
  }

  const { id } = await context.params;
  if (!id) {
    return json({ error: 'Invalid business unit id' }, 400);
  }

  const { data: existing, error: readError } = await supabase
    .from('business_units')
    .select('id, is_active')
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .single();

  if (readError || !existing) {
    return json({ error: 'Business unit not found' }, 404);
  }

  const { data, error } = await supabase
    .from('business_units')
    .update({ is_active: !existing.is_active })
    .eq('id', id)
    .eq('organization_id', profile.organization_id)
    .select('id, code, name, cnpj, is_active, created_at, updated_at')
    .single();

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({ data });
}
