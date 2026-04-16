/**
 * @fileoverview Serviço de WhatsApp via WAHA (WhatsApp HTTP API)
 *
 * Envia e rastreia mensagens WhatsApp usando o WAHA self-hosted.
 * As configurações ficam em organization_settings.waha_config.
 *
 * WAHA docs: https://waha.devlike.pro/docs/
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { toWhatsAppPhone } from '@/lib/phone';

// =============================================================================
// Types
// =============================================================================

export interface WahaConfig {
  baseUrl: string;      // ex.: "http://localhost:3000"
  apiKey: string;       // valor do header x-api-key configurado no WAHA
  sessionName: string;  // nome da sessão WAHA (padrão: "default")
}

export interface SendWahaParams {
  to: string;           // número E.164: +5511999999999
  body: string;
  wahaConfig: WahaConfig;
}

export interface WahaSendResult {
  id: string;
  timestamp: number;
}

export type WahaSessionStatus =
  | 'STOPPED'
  | 'STARTING'
  | 'SCAN_QR_CODE'
  | 'WORKING'
  | 'FAILED';

export interface WahaSessionInfo {
  name: string;
  status: WahaSessionStatus;
  me?: { id: string; pushName: string };
}

export interface WahaQrCode {
  value: string; // data-URL base64 ou string raw do QR
}

export interface AutomationWahaParams {
  dealId: string;
  organizationId: string;
  templateId: string;
  /**
   * Texto livre da mensagem (preenchido via UI de regras de automação).
   * Quando presente, substitui o template hardcoded e interpola variáveis
   * `{{nome_contato}}`, `{{empresa_lead}}`, `{{cnpj}}`, `{{segmento}}`.
   */
  bodyTemplate?: string;
}

/**
 * Interpola variáveis {{var}} no texto livre da regra usando dados do
 * contato e do lead. Mantém vars não reconhecidas como literais.
 */
function interpolateBody(
  template: string,
  vars: {
    contactName?: string | null;
    leadCompanyName?: string | null;
    leadCompanyCnpj?: string | null;
    leadCompanyIndustry?: string | null;
  }
): string {
  return template
    .replace(/\{\{\s*nome_contato\s*\}\}/gi, vars.contactName || '')
    .replace(/\{\{\s*empresa_lead\s*\}\}/gi, vars.leadCompanyName || '')
    .replace(/\{\{\s*cnpj\s*\}\}/gi, vars.leadCompanyCnpj || '')
    .replace(/\{\{\s*segmento\s*\}\}/gi, vars.leadCompanyIndustry || '');
}

// =============================================================================
// Templates de mensagem (reutiliza mesmo catálogo do Twilio)
// =============================================================================

const WA_TEMPLATES: Record<string, (vars: { contactName: string }) => string> = {
  'primeiro-contato': ({ contactName }) =>
    `Olá, ${contactName}! 👋\n\nEspero que esteja bem! Enviei um e-mail para você recentemente e gostaria de saber se teria interesse em conversar.\n\nPodemos ajudar sua empresa a crescer. Tem 15 minutinhos esta semana? 😊`,

  'lembrete': ({ contactName }) =>
    `Olá, ${contactName}! 👋\n\nPassando para ver se recebeu nossa mensagem anterior. Estamos à disposição para uma conversa rápida quando for conveniente para você.\n\nQualquer dúvida, é só responder aqui! 🚀`,
};

function renderTemplate(templateId: string, vars: { contactName: string }): string {
  const template = WA_TEMPLATES[templateId];
  if (!template) throw new Error(`WAHA template not found: ${templateId}`);
  return template(vars);
}

// =============================================================================
// Helpers internos
// =============================================================================

/** Converte número E.164 para chatId do WAHA: "5511999990000@c.us" */
export function toChatId(phone: string): string {
  return `${toWhatsAppPhone(phone)}@c.us`;
}

function wahaHeaders(config: WahaConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey,
  };
}

// =============================================================================
// Funções principais
// =============================================================================

/**
 * Envia mensagem de texto via WAHA REST API.
 * Usa fetch direto (sem SDK) seguindo o padrão do adapter Twilio.
 */
export async function sendWahaMessage(params: SendWahaParams): Promise<WahaSendResult> {
  const { to, body, wahaConfig } = params;

  const url = `${wahaConfig.baseUrl}/api/sendText`;
  const response = await fetch(url, {
    method: 'POST',
    headers: wahaHeaders(wahaConfig),
    body: JSON.stringify({
      session: wahaConfig.sessionName,
      chatId: toChatId(to),
      text: body,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error((error as Record<string, unknown>)?.message as string ?? `WAHA error: ${response.status}`);
  }

  const result = await response.json() as { id?: string; key?: { id: string }; timestamp?: number };
  // WAHA pode retornar { id } ou { key: { id } } dependendo da versão
  const messageId = result.id ?? result.key?.id ?? crypto.randomUUID();
  return { id: messageId, timestamp: result.timestamp ?? Date.now() };
}

// =============================================================================
// Envio de mídia (image, document, voice)
// =============================================================================

/**
 * Parse genérico da resposta WAHA para qualquer endpoint de envio.
 */
async function parseWahaSendResponse(response: Response): Promise<WahaSendResult> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as Record<string, unknown>)?.message as string ?? `WAHA error: ${response.status}`,
    );
  }
  const result = await response.json() as { id?: string; key?: { id: string }; timestamp?: number };
  const messageId = result.id ?? result.key?.id ?? crypto.randomUUID();
  return { id: messageId, timestamp: result.timestamp ?? Date.now() };
}

/**
 * Envia imagem via WAHA /api/sendImage.
 * A URL precisa ser PÚBLICA e acessível pelo WAHA server (bucket
 * `conversation-attachments` é público, então atende).
 */
export async function sendWahaImage(params: {
  to: string;
  mediaUrl: string;
  caption?: string;
  wahaConfig: WahaConfig;
}): Promise<WahaSendResult> {
  const url = `${params.wahaConfig.baseUrl}/api/sendImage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: wahaHeaders(params.wahaConfig),
    body: JSON.stringify({
      session: params.wahaConfig.sessionName,
      chatId: toChatId(params.to),
      file: { url: params.mediaUrl },
      caption: params.caption ?? '',
    }),
  });
  return parseWahaSendResponse(response);
}

/**
 * Envia arquivo (documento PDF/DOCX/etc) via WAHA /api/sendFile.
 */
export async function sendWahaFile(params: {
  to: string;
  mediaUrl: string;
  filename: string;
  caption?: string;
  wahaConfig: WahaConfig;
}): Promise<WahaSendResult> {
  const url = `${params.wahaConfig.baseUrl}/api/sendFile`;
  const response = await fetch(url, {
    method: 'POST',
    headers: wahaHeaders(params.wahaConfig),
    body: JSON.stringify({
      session: params.wahaConfig.sessionName,
      chatId: toChatId(params.to),
      file: { url: params.mediaUrl, filename: params.filename },
      caption: params.caption ?? '',
    }),
  });
  return parseWahaSendResponse(response);
}

/**
 * Envia áudio como voice message (PTT) via WAHA /api/sendVoice.
 *
 * WhatsApp aceita PTT APENAS em OGG/Opus. Como o navegador (Chrome/Firefox/
 * Edge) grava em OGG nativo mas Safari grava em M4A, e uploads de arquivo
 * podem chegar em qualquer formato, passamos `convert: true` para deixar o
 * WAHA Plus converter via ffmpeg server-side. Isso evita que o WhatsApp do
 * destinatário crashe ao abrir um WebM/M4A enviado como PTT.
 */
export async function sendWahaVoice(params: {
  to: string;
  mediaUrl: string;
  wahaConfig: WahaConfig;
}): Promise<WahaSendResult> {
  const url = `${params.wahaConfig.baseUrl}/api/sendVoice`;
  const response = await fetch(url, {
    method: 'POST',
    headers: wahaHeaders(params.wahaConfig),
    body: JSON.stringify({
      session: params.wahaConfig.sessionName,
      chatId: toChatId(params.to),
      file: { url: params.mediaUrl },
      convert: true,
    }),
  });
  return parseWahaSendResponse(response);
}

/**
 * Envia vídeo via WAHA /api/sendVideo.
 */
export async function sendWahaVideo(params: {
  to: string;
  mediaUrl: string;
  caption?: string;
  wahaConfig: WahaConfig;
}): Promise<WahaSendResult> {
  const url = `${params.wahaConfig.baseUrl}/api/sendVideo`;
  const response = await fetch(url, {
    method: 'POST',
    headers: wahaHeaders(params.wahaConfig),
    body: JSON.stringify({
      session: params.wahaConfig.sessionName,
      chatId: toChatId(params.to),
      file: { url: params.mediaUrl },
      caption: params.caption ?? '',
    }),
  });
  return parseWahaSendResponse(response);
}

/**
 * Envia WhatsApp de automação para o contato de um deal via WAHA.
 * Também persiste a mensagem outbound no banco.
 */
export async function sendAutomationWaha(
  supabase: SupabaseClient,
  params: AutomationWahaParams
): Promise<Record<string, unknown>> {
  // Buscar deal + contato (inclui campos da empresa do lead para interpolação)
  const { data: deal } = await supabase
    .from('deals')
    .select('id, title, contact_id, contacts(name, phone, lead_company_name, lead_company_cnpj, lead_company_industry)')
    .eq('id', params.dealId)
    .single();

  if (!deal) throw new Error('Deal not found');

  const contact = (deal as Record<string, unknown>).contacts as {
    name: string;
    phone: string;
    lead_company_name?: string | null;
    lead_company_cnpj?: string | null;
    lead_company_industry?: string | null;
  } | null;
  if (!contact?.phone) throw new Error('Contact has no phone number');

  // Buscar configuração WAHA da organização
  const { data: settings } = await supabase
    .from('organization_settings')
    .select('waha_config')
    .eq('organization_id', params.organizationId)
    .single();

  const wahaConfig = (settings as Record<string, unknown>)?.waha_config as WahaConfig | null;
  if (!wahaConfig?.baseUrl) throw new Error('WAHA not configured for this organization');

  const body = params.bodyTemplate
    ? interpolateBody(params.bodyTemplate, {
        contactName: contact.name ?? 'Cliente',
        leadCompanyName: contact.lead_company_name,
        leadCompanyCnpj: contact.lead_company_cnpj,
        leadCompanyIndustry: contact.lead_company_industry,
      })
    : renderTemplate(params.templateId, {
        contactName: contact.name ?? 'Cliente',
      });

  const result = await sendWahaMessage({ to: contact.phone, body, wahaConfig });

  // Persistir mensagem outbound
  await storeOutboundMessage(supabase, {
    organizationId: params.organizationId,
    dealId: params.dealId,
    phone: contact.phone,
    body,
    waMessageId: result.id,
    sentAt: new Date(result.timestamp).toISOString(),
  });

  return { id: result.id, to: contact.phone, template: params.templateId };
}

/**
 * Testa a conexão com o servidor WAHA consultando o status da sessão.
 */
export async function testWahaConnection(
  config: WahaConfig
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `${config.baseUrl}/api/sessions/${config.sessionName}`;
    const response = await fetch(url, {
      headers: { 'x-api-key': config.apiKey },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { ok: false, error: (err as Record<string, unknown>)?.message as string ?? `HTTP ${response.status}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Retorna o status atual da sessão WAHA.
 */
export async function getWahaSessionStatus(config: WahaConfig): Promise<WahaSessionInfo> {
  const url = `${config.baseUrl}/api/sessions/${config.sessionName}`;
  const response = await fetch(url, {
    headers: { 'x-api-key': config.apiKey },
  });

  if (!response.ok) {
    return { name: config.sessionName, status: 'STOPPED' };
  }

  const data = await response.json() as WahaSessionInfo;
  return data;
}

/**
 * Retorna o QR code da sessão para autenticação (escaneio via WhatsApp no celular).
 * Só faz sentido chamar quando status === 'SCAN_QR_CODE'.
 */
export async function getWahaQrCode(config: WahaConfig): Promise<WahaQrCode | null> {
  try {
    // Tenta endpoint de QR como imagem (retorna PNG/data-URL)
    const url = `${config.baseUrl}/api/${config.sessionName}/auth/qr`;
    const response = await fetch(url, {
      headers: { 'x-api-key': config.apiKey },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('image/')) {
      // Retorna data-URL para exibição direta como <img>
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      return { value: `data:${contentType};base64,${base64}` };
    }

    // WAHA pode retornar JSON com { value: string }
    const data = await response.json() as { value?: string; qr?: string };
    const qrValue = data.value ?? data.qr ?? '';
    return qrValue ? { value: qrValue } : null;
  } catch {
    return null;
  }
}

// =============================================================================
// Helper interno: persistência de mensagem outbound
// =============================================================================

interface StoreOutboundParams {
  organizationId: string;
  dealId: string;
  phone: string;
  body: string;
  waMessageId: string;
  sentAt: string;
}

async function storeOutboundMessage(
  supabase: SupabaseClient,
  params: StoreOutboundParams
): Promise<void> {
  const chatId = toChatId(params.phone);

  // Upsert conversa
  const { data: conv } = await supabase
    .from('conversations')
    .upsert(
      {
        organization_id: params.organizationId,
        deal_id: params.dealId,
        wa_chat_id: chatId,
        channel: 'whatsapp',
        last_message_at: params.sentAt,
      },
      { onConflict: 'organization_id,wa_chat_id', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (!conv?.id) return;

  // Inserir mensagem outbound (ignora duplicatas por wa_message_id)
  await supabase.from('messages').upsert(
    {
      organization_id: params.organizationId,
      conversation_id: conv.id,
      wa_message_id: params.waMessageId,
      direction: 'outbound',
      body: params.body,
      status: 'sent',
      sent_at: params.sentAt,
    },
    { onConflict: 'organization_id,wa_message_id', ignoreDuplicates: true }
  );
}
