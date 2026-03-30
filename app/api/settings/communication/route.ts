/**
 * GET/PUT /api/settings/communication
 *
 * Lê e salva configurações de SMTP e Twilio da organização.
 * Também suporta POST /test-smtp e POST /test-twilio para validar conexões.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const SmtpSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().min(1),
  pass: z.string(), // permite '' (mantém existente) ou '••••••••' (mascarado)
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
}).nullable();

const TwilioSchema = z.object({
  accountSid: z.string().min(1),
  authToken: z.string(), // permite '' ou mascarado
  fromNumber: z.string().min(1),
}).nullable();

const SerasaSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string(), // permite '' ou mascarado
  baseUrl: z.string().url(),
  minimumScore: z.number().min(0).max(1000),
}).nullable();

const CustomerBaseSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string(), // permite '' ou mascarado
  timeoutMs: z.number().optional(),
}).nullable();

const WahaSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string(), // permite '' ou mascarado
  sessionName: z.string().min(1).default('default'),
}).nullable();

const MetaWhatsAppSchema = z.object({
  phoneNumberId: z.string().min(1),
  accessToken: z.string(), // permite '' ou mascarado
  businessAccountId: z.string().optional(),
  webhookVerifyToken: z.string().optional(),
  appSecret: z.string().optional(),
}).nullable();

const PutSchema = z.object({
  smtp: SmtpSchema.optional(),
  twilio: TwilioSchema.optional(),
  serasa: SerasaSchema.optional(),
  customerBase: CustomerBaseSchema.optional(),
  waha: WahaSchema.optional(),
  metaWhatsApp: MetaWhatsAppSchema.optional(),
});

// =============================================================================
// GET — lê configurações (sem expor pass/authToken)
// =============================================================================

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { data: settings } = await supabase
    .from('organization_settings')
    .select('smtp_config, twilio_config, serasa_config, customer_base_config, waha_config, meta_whatsapp_config')
    .eq('organization_id', profile.organization_id)
    .single();

  const smtp = (settings as any)?.smtp_config ?? null;
  const twilio = (settings as any)?.twilio_config ?? null;
  const serasa = (settings as any)?.serasa_config ?? null;
  const customerBase = (settings as any)?.customer_base_config ?? null;
  const waha = (settings as any)?.waha_config ?? null;
  const metaWhatsApp = (settings as any)?.meta_whatsapp_config ?? null;

  // Mascarar campos sensíveis antes de retornar
  return NextResponse.json({
    smtp: smtp ? { ...smtp, pass: smtp.pass ? '••••••••' : '' } : null,
    twilio: twilio ? { ...twilio, authToken: twilio.authToken ? '••••••••' : '' } : null,
    serasa: serasa ? { ...serasa, clientSecret: serasa.clientSecret ? '••••••••' : '' } : null,
    customerBase: customerBase ? { ...customerBase, apiKey: customerBase.apiKey ? '••••••••' : '' } : null,
    waha: waha ? { ...waha, apiKey: waha.apiKey ? '••••••••' : '' } : null,
    metaWhatsApp: metaWhatsApp ? { ...metaWhatsApp, accessToken: metaWhatsApp.accessToken ? '••••••••' : '', appSecret: metaWhatsApp.appSecret ? '••••••••' : '' } : null,
    configured: {
      smtp: !!(smtp?.host),
      twilio: !!(twilio?.accountSid),
      serasa: !!(serasa?.clientId),
      customerBase: !!(customerBase?.baseUrl),
      waha: !!(waha?.baseUrl),
      metaWhatsApp: !!(metaWhatsApp?.phoneNumberId),
    },
  });
}

// =============================================================================
// PUT — salva configurações
// =============================================================================

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 422 });
  }

  const updates: Record<string, unknown> = {};

  // Helper: campo mascarado ou vazio = manter valor existente no banco
  const isMasked = (v: string | undefined | null) => !v || v === '••••••••';

  // Busca config existente uma única vez se algum campo mascarado precisar ser restaurado
  let existingSettings: Record<string, unknown> | null = null;
  const needsExisting =
    (parsed.data.smtp && isMasked(parsed.data.smtp?.pass)) ||
    (parsed.data.twilio && isMasked(parsed.data.twilio?.authToken)) ||
    (parsed.data.serasa && isMasked(parsed.data.serasa?.clientSecret)) ||
    (parsed.data.customerBase && isMasked(parsed.data.customerBase?.apiKey)) ||
    (parsed.data.waha && isMasked(parsed.data.waha?.apiKey)) ||
    (parsed.data.metaWhatsApp && (isMasked(parsed.data.metaWhatsApp?.accessToken) || isMasked(parsed.data.metaWhatsApp?.appSecret)));

  if (needsExisting) {
    const { data: ex } = await supabase
      .from('organization_settings')
      .select('smtp_config, twilio_config, serasa_config, customer_base_config, waha_config, meta_whatsapp_config')
      .eq('organization_id', profile.organization_id)
      .single();
    existingSettings = ex as Record<string, unknown> | null;
  }

  if (parsed.data.smtp !== undefined) {
    if (isMasked(parsed.data.smtp?.pass)) {
      parsed.data.smtp!.pass = (existingSettings as any)?.smtp_config?.pass ?? '';
    }
    updates.smtp_config = parsed.data.smtp;
  }

  if (parsed.data.twilio !== undefined) {
    if (isMasked(parsed.data.twilio?.authToken)) {
      parsed.data.twilio!.authToken = (existingSettings as any)?.twilio_config?.authToken ?? '';
    }
    updates.twilio_config = parsed.data.twilio;
  }

  if (parsed.data.serasa !== undefined) {
    if (isMasked(parsed.data.serasa?.clientSecret)) {
      parsed.data.serasa!.clientSecret = (existingSettings as any)?.serasa_config?.clientSecret ?? '';
    }
    updates.serasa_config = parsed.data.serasa;
  }

  if (parsed.data.customerBase !== undefined) {
    if (isMasked(parsed.data.customerBase?.apiKey)) {
      parsed.data.customerBase!.apiKey = (existingSettings as any)?.customer_base_config?.apiKey ?? '';
    }
    updates.customer_base_config = parsed.data.customerBase;
  }

  if (parsed.data.waha !== undefined) {
    if (isMasked(parsed.data.waha?.apiKey)) {
      parsed.data.waha!.apiKey = (existingSettings as any)?.waha_config?.apiKey ?? '';
    }
    updates.waha_config = parsed.data.waha;
  }

  if (parsed.data.metaWhatsApp !== undefined) {
    if (isMasked(parsed.data.metaWhatsApp?.accessToken)) {
      parsed.data.metaWhatsApp!.accessToken = (existingSettings as any)?.meta_whatsapp_config?.accessToken ?? '';
    }
    if (isMasked(parsed.data.metaWhatsApp?.appSecret)) {
      parsed.data.metaWhatsApp!.appSecret = (existingSettings as any)?.meta_whatsapp_config?.appSecret ?? '';
    }
    updates.meta_whatsapp_config = parsed.data.metaWhatsApp;
  }

  const { error } = await supabase
    .from('organization_settings')
    .update(updates)
    .eq('organization_id', profile.organization_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
