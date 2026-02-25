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

const LinkItemSchema = z.object({
  businessUnitId: z.string().uuid(),
  relationshipType: z.enum(['prospect', 'customer', 'inactive']).default('prospect'),
  sinceAt: z.string().date().optional().nullable(),
});

const UpdateLinksSchema = z.object({
  links: z.array(LinkItemSchema).default([]),
}).strict();

async function getContext(contactId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, error: json({ error: 'Unauthorized' }, 401) } as const;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, organization_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return { supabase, error: json({ error: 'Profile not found' }, 404) } as const;
  }

  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('organization_id', profile.organization_id)
    .maybeSingle();

  if (contactError || !contact) {
    return { supabase, error: json({ error: 'Contact not found' }, 404) } as const;
  }

  return { supabase, profile, error: null } as const;
}

/**
 * Handler HTTP `GET` deste endpoint (Next.js Route Handler).
 *
 * @param {Request} _req - Objeto da requisição.
 * @param {{ params: Promise<{ contactId: string }> }} context - Contexto da rota.
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function GET(_req: Request, context: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await context.params;

  const ctx = await getContext(contactId);
  if (ctx.error) return ctx.error;

  const { supabase, profile } = ctx;

  const [linksRes, unitsRes] = await Promise.all([
    supabase
      .from('contact_business_units')
      .select('business_unit_id, relationship_type, since_at, created_at')
      .eq('organization_id', profile.organization_id)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true }),
    supabase
      .from('business_units')
      .select('id, code, name, is_active')
      .eq('organization_id', profile.organization_id)
      .order('name', { ascending: true }),
  ]);

  if (linksRes.error) return json({ error: linksRes.error.message }, 500);
  if (unitsRes.error) return json({ error: unitsRes.error.message }, 500);

  const links = (linksRes.data ?? []).map((row) => ({
    businessUnitId: row.business_unit_id,
    relationshipType: row.relationship_type,
    sinceAt: row.since_at,
    createdAt: row.created_at,
  }));

  const businessUnits = (unitsRes.data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.is_active,
  }));

  return json({ data: { links, businessUnits } });
}

/**
 * Handler HTTP `PUT` deste endpoint (Next.js Route Handler).
 *
 * @param {Request} req - Objeto da requisição.
 * @param {{ params: Promise<{ contactId: string }> }} context - Contexto da rota.
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function PUT(req: Request, context: { params: Promise<{ contactId: string }> }) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const { contactId } = await context.params;

  const ctx = await getContext(contactId);
  if (ctx.error) return ctx.error;

  const { supabase, profile } = ctx;

  const payload = await req.json().catch(() => null);
  const parsed = UpdateLinksSchema.safeParse(payload);

  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const uniqueByBu = new Map<string, z.infer<typeof LinkItemSchema>>();
  for (const item of parsed.data.links) {
    uniqueByBu.set(item.businessUnitId, item);
  }
  const links = Array.from(uniqueByBu.values());

  if (links.length > 0) {
    const buIds = links.map((item) => item.businessUnitId);
    const { data: units, error: unitsError } = await supabase
      .from('business_units')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .in('id', buIds);

    if (unitsError) return json({ error: unitsError.message }, 500);

    const validIds = new Set((units ?? []).map((row) => row.id));
    const hasInvalid = buIds.some((id) => !validIds.has(id));
    if (hasInvalid) {
      return json({ error: 'One or more business units are invalid for this organization' }, 400);
    }
  }

  const { error: deleteError } = await supabase
    .from('contact_business_units')
    .delete()
    .eq('organization_id', profile.organization_id)
    .eq('contact_id', contactId);

  if (deleteError) return json({ error: deleteError.message }, 500);

  if (links.length > 0) {
    const rows = links.map((item) => ({
      organization_id: profile.organization_id,
      contact_id: contactId,
      business_unit_id: item.businessUnitId,
      relationship_type: item.relationshipType,
      since_at: item.sinceAt ?? null,
    }));

    const { error: insertError } = await supabase
      .from('contact_business_units')
      .insert(rows);

    if (insertError) return json({ error: insertError.message }, 500);
  }

  return json({ ok: true });
}
