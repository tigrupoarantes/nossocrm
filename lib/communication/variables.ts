/**
 * Interpolação de variáveis em templates de mensagem (WhatsApp e e-mail).
 *
 * Variáveis suportadas (case-insensitive):
 *   {{nome_contato}}   — nome do contato
 *   {{empresa_lead}}   — razão social da empresa do lead
 *   {{cnpj}}           — CNPJ formatado
 *   {{segmento}}       — segmento/indústria do lead
 *
 * Vars não reconhecidas são mantidas como literais.
 */

export interface MessageVariables {
  contactName?: string | null;
  leadCompanyName?: string | null;
  leadCompanyCnpj?: string | null;
  leadCompanyIndustry?: string | null;
}

export function interpolateVariables(template: string, vars: MessageVariables): string {
  return template
    .replace(/\{\{\s*nome_contato\s*\}\}/gi, vars.contactName || '')
    .replace(/\{\{\s*empresa_lead\s*\}\}/gi, vars.leadCompanyName || '')
    .replace(/\{\{\s*cnpj\s*\}\}/gi, vars.leadCompanyCnpj || '')
    .replace(/\{\{\s*segmento\s*\}\}/gi, vars.leadCompanyIndustry || '');
}
