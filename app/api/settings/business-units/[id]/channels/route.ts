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

const EmailConfigSchema = z
  .object({
    senderName: z.string().trim().max(120).optional().nullable(),
    senderEmail: z.string().trim().email().max(160).optional().nullable(),
    replyTo: z.string().trim().email().max(160).optional().nullable(),
    smtpHost: z.string().trim().max(160).optional().nullable(),
    smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
    smtpUsername: z.string().trim().max(160).optional().nullable(),
    smtpPassword: z.string().max(500).optional().nullable(),
    smtpSecure: z.boolean().optional().nullable(),
  })
  .strict();

const WhatsappConfigSchema = z
  .object({
    provider: z.string().trim().max(80).optional().nullable(),
    phoneNumberId: z.string().trim().max(200).optional().nullable(),
    businessAccountId: z.string().trim().max(200).optional().nullable(),
    accessToken: z.string().max(500).optional().nullable(),
    fromNumber: z.string().trim().max(30).optional().nullable(),
    webhookUrl: z.string().trim().url().max(500).optional().nullable(),
  })
  .strict();

const UpsertChannelSchema = z
  .object({
    channel: z.enum(['email', 'whatsapp']),
    isActive: z.boolean(),
    config: z.union([EmailConfigSchema, WhatsappConfigSchema]),
  })
  .strict();

async function getAdminContext() {
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

  if (profile.role !== 'admin') {
    return { supabase, error: json({ error: 'Forbidden' }, 403) } as const;
  }

  return { supabase, profile, error: null } as const;
}

async function assertBusinessUnitInOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessUnitId: string,
  organizationId: string
) {
  const { data, error } = await supabase
    .from('business_units')
    .select('id, code, name')
    .eq('id', businessUnitId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !data) {
    return { error: json({ error: 'Business unit not found' }, 404), data: null } as const;
  }

  return { error: null, data } as const;
}

function normalizeString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Handler HTTP `GET` deste endpoint (Next.js Route Handler).
 *
 * @param {Request} _req - Objeto da requisição.
 * @param {{ params: Promise<{ id: string }> }} context - Contexto da rota.
 * @returns {Promise<Response>} Retorna um valor do tipo `Promise<Response>`.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminContext();
  if (ctx.error) return ctx.error;

  const { id } = await context.params;
  if (!id) return json({ error: 'Invalid business unit id' }, 400);

  const buCheck = await assertBusinessUnitInOrg(ctx.supabase, id, ctx.profile.organization_id);
  if (buCheck.error) return buCheck.error;

  const { data, error } = await ctx.supabase
    .from('business_unit_channel_settings')
    .select('channel, is_active, config, updated_at')
    .eq('organization_id', ctx.profile.organization_id)
    .eq('business_unit_id', id)
    .in('channel', ['email', 'whatsapp']);

  if (error) {
    return json({ error: error.message }, 500);
  }

  const rows = data ?? [];
  const email = rows.find((row) => row.channel === 'email');
  const whatsapp = rows.find((row) => row.channel === 'whatsapp');

  return json({
    data: {
      businessUnit: buCheck.data,
      channels: {
        email: {
          isActive: Boolean(email?.is_active),
          config: email?.config ?? {},
          updatedAt: email?.updated_at ?? null,
        },
        whatsapp: {
          isActive: Boolean(whatsapp?.is_active),
          config: whatsapp?.config ?? {},
          updatedAt: whatsapp?.updated_at ?? null,
        },
      },
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

  const ctx = await getAdminContext();
  if (ctx.error) return ctx.error;

  const { id } = await context.params;
  if (!id) return json({ error: 'Invalid business unit id' }, 400);

  const buCheck = await assertBusinessUnitInOrg(ctx.supabase, id, ctx.profile.organization_id);
  if (buCheck.error) return buCheck.error;

  const payload = await req.json().catch(() => null);
  const parsed = UpsertChannelSchema.safeParse(payload);

  if (!parsed.success) {
    return json({ error: 'Invalid payload', details: parsed.error.flatten() }, 400);
  }

  const config =
    parsed.data.channel === 'email'
      ? EmailConfigSchema.parse(parsed.data.config)
      : WhatsappConfigSchema.parse(parsed.data.config);

  const sanitizedConfig = Object.fromEntries(
    Object.entries(config).map(([key, value]) => {
      if (typeof value === 'string') return [key, normalizeString(value)];
      return [key, value ?? null];
    })
  );

  const { data, error } = await ctx.supabase
    .from('business_unit_channel_settings')
    .upsert(
      {
        organization_id: ctx.profile.organization_id,
        business_unit_id: id,
        channel: parsed.data.channel,
        is_active: parsed.data.isActive,
        config: sanitizedConfig,
      },
      { onConflict: 'business_unit_id,channel' }
    )
    .select('channel, is_active, config, updated_at')
    .single();

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({
    data: {
      businessUnit: buCheck.data,
      channel: data.channel,
      isActive: data.is_active,
      config: data.config ?? {},
      updatedAt: data.updated_at,
    },
  });
}
