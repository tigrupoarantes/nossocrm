/**
 * @fileoverview Serviço de e-mail via Nodemailer/SMTP
 *
 * Envia e-mails transacionais usando configuração SMTP por organização.
 * As configurações ficam em organization_settings.smtp_config.
 */

import nodemailer from 'nodemailer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderEmailTemplate } from './templates/email';
import { interpolateVariables } from './variables';

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

export interface EmailAttachment {
  filename: string;
  /** URL pública do arquivo (bucket conversation-attachments). */
  path: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  smtpConfig: SmtpConfig;
  attachments?: EmailAttachment[];
}

export interface AutomationEmailParams {
  dealId: string;
  organizationId: string;
  templateId: string;
  /** Assunto livre. Quando presente junto com bodyTemplate, ignora o template fixo. */
  subjectTemplate?: string;
  /** Corpo livre. Interpola variáveis {{nome_contato}} etc. */
  bodyTemplate?: string;
  attachment?: {
    url: string;
    filename: string;
    mediaType: 'image' | 'audio' | 'video' | 'document';
  };
}

// =============================================================================
// Funções principais
// =============================================================================

/**
 * Envia um e-mail via SMTP configurado.
 */
export async function sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
  const { to, subject, html, text, smtpConfig, attachments } = params;

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
    attachments: attachments?.map(a => ({ filename: a.filename, path: a.path })),
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
  // Buscar deal + contato (inclui campos do lead pra interpolar variáveis livres)
  const { data: deal } = await supabase
    .from('deals')
    .select('id, title, contact_id, organization_id, contacts(name, email, lead_company_name, lead_company_cnpj, lead_company_industry)')
    .eq('id', params.dealId)
    .single();

  if (!deal) throw new Error('Deal not found');

  const contact = (deal as any).contacts as {
    name: string;
    email: string;
    lead_company_name?: string | null;
    lead_company_cnpj?: string | null;
    lead_company_industry?: string | null;
  } | null;
  if (!contact?.email) throw new Error('Contact has no email address');

  // Buscar configuração SMTP da organização
  const { data: settings } = await supabase
    .from('organization_settings')
    .select('smtp_config')
    .eq('organization_id', params.organizationId)
    .single();

  const smtpConfig = (settings as any)?.smtp_config as SmtpConfig | null;
  if (!smtpConfig?.host) throw new Error('SMTP not configured for this organization');

  // Renderiza assunto/corpo livres (UI nova) OU cai no template fixo (legado).
  let subject: string;
  let html: string;
  if (params.bodyTemplate) {
    const vars = {
      contactName: contact.name ?? 'Cliente',
      leadCompanyName: contact.lead_company_name,
      leadCompanyCnpj: contact.lead_company_cnpj,
      leadCompanyIndustry: contact.lead_company_industry,
    };
    subject = interpolateVariables(params.subjectTemplate ?? '(sem assunto)', vars);
    const body = interpolateVariables(params.bodyTemplate, vars);
    // Preserva quebras de linha do textarea.
    html = body
      .split('\n')
      .map(line => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
      .join('<br/>');
  } else {
    const rendered = renderEmailTemplate(params.templateId, {
      contactName: contact.name ?? 'Cliente',
      dealTitle: deal.title,
    });
    subject = rendered.subject;
    html = rendered.html;
  }

  const attachments: EmailAttachment[] | undefined = params.attachment
    ? [{ filename: params.attachment.filename, path: params.attachment.url }]
    : undefined;

  const result = await sendEmail({
    to: contact.email,
    subject,
    html,
    smtpConfig,
    attachments,
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
