/**
 * @fileoverview Serviço de e-mail via Nodemailer/SMTP
 *
 * Envia e-mails transacionais usando configuração SMTP por organização.
 * As configurações ficam em organization_settings.smtp_config.
 */

import nodemailer from 'nodemailer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderEmailTemplate } from './templates/email';

// =============================================================================
// Types
// =============================================================================

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  smtpConfig: SmtpConfig;
}

export interface AutomationEmailParams {
  dealId: string;
  organizationId: string;
  templateId: string;
}

// =============================================================================
// Funções principais
// =============================================================================

/**
 * Envia um e-mail via SMTP configurado.
 */
export async function sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
  const { to, subject, html, text, smtpConfig } = params;

  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass,
    },
  });

  const info = await transporter.sendMail({
    from: `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`,
    to,
    subject,
    html,
    text: text ?? html.replace(/<[^>]*>/g, ''),
  });

  return { messageId: info.messageId };
}

/**
 * Envia e-mail de automação para o contato de um deal.
 * Busca config SMTP da organização e dados do deal/contato no Supabase.
 */
export async function sendAutomationEmail(
  supabase: SupabaseClient,
  params: AutomationEmailParams
): Promise<Record<string, unknown>> {
  // Buscar deal + contato
  const { data: deal } = await supabase
    .from('deals')
    .select('id, title, contact_id, organization_id, contacts(name, email)')
    .eq('id', params.dealId)
    .single();

  if (!deal) throw new Error('Deal not found');

  const contact = (deal as any).contacts;
  if (!contact?.email) throw new Error('Contact has no email address');

  // Buscar configuração SMTP da organização
  const { data: settings } = await supabase
    .from('organization_settings')
    .select('smtp_config')
    .eq('organization_id', params.organizationId)
    .single();

  const smtpConfig = (settings as any)?.smtp_config as SmtpConfig | null;
  if (!smtpConfig?.host) throw new Error('SMTP not configured for this organization');

  // Renderizar template
  const { subject, html } = renderEmailTemplate(params.templateId, {
    contactName: contact.name ?? 'Cliente',
    dealTitle: deal.title,
  });

  const result = await sendEmail({
    to: contact.email,
    subject,
    html,
    smtpConfig,
  });

  return { messageId: result.messageId, to: contact.email, template: params.templateId };
}

/**
 * Testa a conexão SMTP com as configurações fornecidas.
 */
export async function testSmtpConnection(config: SmtpConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
