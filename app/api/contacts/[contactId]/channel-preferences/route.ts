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

const PreferenceItemSchema = z.object({
  businessUnitId: z.string().uuid(),
  channel: z.enum(['email', 'whatsapp']),
  optIn: z.boolean(),
  source: z.string().trim().max(100).optional(),
});

const UpdatePreferencesSchema = z.object({
  preferences: z.array(PreferenceItemSchema).default([]),
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

  const [prefsRes, linksRes] = await Promise.all([
    supabase
      .from('contact_channel_preferences')
      .select('business_unit_id, channel, opt_in, unsubscribed_at, source, updated_at')
      .eq('organization_id', profile.organization_id)
      .eq('contact_id', contactId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('contact_business_units')
      .select('business_unit_id')
      .eq('organization_id', profile.organization_id)
      .eq('contact_id', contactId),
  ]);

  if (prefsRes.error) return json({ error: prefsRes.error.message }, 500);
  if (linksRes.error) return json({ error: linksRes.error.message }, 500);

  const linkedBusinessUnitIds = (linksRes.data ?? []).map((row) => row.business_unit_id);

  const preferences = (prefsRes.data ?? []).map((row) => ({
    businessUnitId: row.business_unit_id,
    channel: row.channel,
    optIn: row.opt_in,
    unsubscribedAt: row.unsubscribed_at,
    source: row.source,
    updatedAt: row.updated_at,
  }));

  return json({ data: { linkedBusinessUnitIds, preferences } });
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
  const parsed = UpdatePreferencesSchema.safeParse(payload);

  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const dedupeMap = new Map<string, z.infer<typeof PreferenceItemSchema>>();
  for (const item of parsed.data.preferences) {
    dedupeMap.set(`${item.businessUnitId}:${item.channel}`, item);
  }
  const preferences = Array.from(dedupeMap.values());

  if (preferences.length > 0) {
    const buIds = Array.from(new Set(preferences.map((item) => item.businessUnitId)));

    const { data: contactLinks, error: linksError } = await supabase
      .from('contact_business_units')
      .select('business_unit_id')
      .eq('organization_id', profile.organization_id)
      .eq('contact_id', contactId)
      .in('business_unit_id', buIds);

    if (linksError) return json({ error: linksError.message }, 500);

    const linkedIds = new Set((contactLinks ?? []).map((row) => row.business_unit_id));
    const hasUnlinked = buIds.some((id) => !linkedIds.has(id));
    if (hasUnlinked) {
      return json({ error: 'Preferences require contact to be linked to all provided business units' }, 400);
    }
  }

  const { error: deleteError } = await supabase
    .from('contact_channel_preferences')
    .delete()
    .eq('organization_id', profile.organization_id)
    .eq('contact_id', contactId);

  if (deleteError) return json({ error: deleteError.message }, 500);

  if (preferences.length > 0) {
    const nowIso = new Date().toISOString();
    const rows = preferences.map((item) => ({
      organization_id: profile.organization_id,
      contact_id: contactId,
      business_unit_id: item.businessUnitId,
      channel: item.channel,
      opt_in: item.optIn,
      unsubscribed_at: item.optIn ? null : nowIso,
      source: item.source?.trim() || 'manual',
    }));

    const { error: insertError } = await supabase
      .from('contact_channel_preferences')
      .insert(rows);

    if (insertError) return json({ error: insertError.message }, 500);
  }

  return json({ ok: true });
}
