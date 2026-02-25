import { z } from 'zod';
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

const CreateBusinessUnitSchema = z
  .object({
    code: z.string().trim().min(2).max(30),
    name: z.string().trim().min(2).max(120),
    cnpj: z.string().trim().max(30).optional().nullable(),
  })
  .strict();

async function getCurrentProfile() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, error: json({ error: 'Unauthorized' }, 401) } as const;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return { supabase, error: json({ error: 'Profile not found' }, 404) } as const;
  }

  return { supabase, profile, error: null } as const;
}

/**
 * Handler HTTP `GET` deste endpoint (Next.js Route Handler).
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function GET() {
  const ctx = await getCurrentProfile();
  if (ctx.error) return ctx.error;

  const { supabase, profile } = ctx;

  const { data, error } = await supabase
    .from('business_units')
    .select('id, code, name, cnpj, is_active, created_at, updated_at')
    .eq('organization_id', profile.organization_id)
    .order('name', { ascending: true });

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({ data: data ?? [] });
}

/**
 * Handler HTTP `POST` deste endpoint (Next.js Route Handler).
 *
 * @param {Request} req - Objeto da requisição.
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const ctx = await getCurrentProfile();
  if (ctx.error) return ctx.error;

  const { supabase, profile } = ctx;

  if (profile.role !== 'admin') {
    return json({ error: 'Forbidden' }, 403);
  }

  const payload = await req.json().catch(() => null);
  const parsed = CreateBusinessUnitSchema.safeParse(payload);

  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const code = parsed.data.code.trim().toUpperCase();
  const name = parsed.data.name.trim();
  const cnpj = parsed.data.cnpj?.trim() || null;

  const { data, error } = await supabase
    .from('business_units')
    .insert({
      organization_id: profile.organization_id,
      code,
      name,
      cnpj,
      is_active: true,
    })
    .select('id, code, name, cnpj, is_active, created_at, updated_at')
    .single();

  if (error) {
    const status = error.code === '23505' ? 409 : 500;
    return json({ error: error.message }, status);
  }

  return json({ data }, 201);
}
