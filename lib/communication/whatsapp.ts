/**
 * @fileoverview Serviço de WhatsApp via Twilio
 *
 * Envia mensagens WhatsApp usando a Twilio WhatsApp Business API.
 * As configurações ficam em organization_settings.twilio_config.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string; // formato: whatsapp:+5511999999999
}

export interface SendWhatsAppParams {
  to: string; // número com DDI: +5511999999999
  body: string;
  twilioConfig: TwilioConfig;
}

export interface AutomationWhatsAppParams {
  dealId: string;
  organizationId: string;
  templateId: string;
}

// =============================================================================
// Templates de mensagem WhatsApp
// =============================================================================

const WA_TEMPLATES: Record<string, (vars: { contactName: string }) => string> = {
  'primeiro-contato': ({ contactName }) =>
    `Olá, ${contactName}! 👋\n\nEspero que esteja bem! Enviei um e-mail para você recentemente e gostaria de saber se teria interesse em conversar.\n\nPodemos ajudar sua empresa a crescer. Tem 15 minutinhos esta semana? 😊`,

  'lembrete': ({ contactName }) =>
    `Olá, ${contactName}! 👋\n\nPassando para ver se recebeu nossa mensagem anterior. Estamos à disposição para uma conversa rápida quando for conveniente para você.\n\nQualquer dúvida, é só responder aqui! 🚀`,
};

function renderWhatsAppTemplate(templateId: string, vars: { contactName: string }): string {
  const template = WA_TEMPLATES[templateId];
  if (!template) throw new Error(`WhatsApp template not found: ${templateId}`);
  return template(vars);
}

// =============================================================================
// Funções principais
// =============================================================================

/**
 * Envia mensagem WhatsApp via Twilio REST API.
 * Usamos fetch direto para evitar dependência do SDK Twilio no bundle do cliente.
 */
export async function sendWhatsApp(params: SendWhatsAppParams): Promise<{ sid: string }> {
  const { to, body, twilioConfig } = params;

  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to.startsWith('+') ? to : `+${to}`}`;
  const fromFormatted = twilioConfig.fromNumber.startsWith('whatsapp:')
    ? twilioConfig.fromNumber
    : `whatsapp:${twilioConfig.fromNumber}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.accountSid}/Messages.json`;

  const body_params = new URLSearchParams({
    To: toFormatted,
    From: fromFormatted,
    Body: body,
  });

  const credentials = Buffer.from(`${twilioConfig.accountSid}:${twilioConfig.authToken}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body_params.toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as any)?.message ?? `Twilio error: ${response.status}`);
  }

  const result = await response.json() as { sid: string };
  return { sid: result.sid };
}

/**
 * Envia WhatsApp de automação para o contato de um deal.
 */
export async function sendAutomationWhatsApp(
  supabase: SupabaseClient,
  params: AutomationWhatsAppParams
): Promise<Record<string, unknown>> {
  // Buscar deal + contato
  const { data: deal } = await supabase
    .from('deals')
    .select('id, title, contact_id, contacts(name, phone)')
    .eq('id', params.dealId)
    .single();

  if (!deal) throw new Error('Deal not found');

  const contact = (deal as any).contacts;
  if (!contact?.phone) throw new Error('Contact has no phone number');

  // Buscar configuração Twilio da organização
  const { data: settings } = await supabase
    .from('organization_settings')
    .select('twilio_config')
    .eq('organization_id', params.organizationId)
    .single();

  const twilioConfig = (settings as any)?.twilio_config as TwilioConfig | null;
  if (!twilioConfig?.accountSid) throw new Error('Twilio not configured for this organization');

  const body = renderWhatsAppTemplate(params.templateId, {
    contactName: contact.name ?? 'Cliente',
  });

  const result = await sendWhatsApp({
    to: contact.phone,
    body,
    twilioConfig,
  });

  return { sid: result.sid, to: contact.phone, template: params.templateId };
}

/**
 * Testa credenciais Twilio fazendo uma chamada à API de conta.
 */
export async function testTwilioCredentials(
  config: TwilioConfig
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}.json`;
    const credentials = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');

    const response = await fetch(url, {
      headers: { 'Authorization': `Basic ${credentials}` },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { ok: false, error: (err as any)?.message ?? `HTTP ${response.status}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
