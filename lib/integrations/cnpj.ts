/**
 * @fileoverview Validação de CNPJ via BrasilAPI
 *
 * Usa a BrasilAPI (gratuita, sem credenciais) para validar CNPJs.
 * https://brasilapi.com.br/docs#tag/CNPJ
 */

export interface CNPJResult {
  valid: boolean;
  active: boolean;
  cnpj: string;
  razaoSocial?: string;
  situacao?: string;
  abertura?: string;
  raw?: Record<string, unknown>;
  error?: string;
}

/**
 * Valida um CNPJ via BrasilAPI.
 * Retorna valid=false se CNPJ inativo, não encontrado ou inválido.
 */
export async function validateCNPJ(cnpj: string): Promise<CNPJResult> {
  const cleaned = cnpj.replace(/\D/g, '');

  if (cleaned.length !== 14) {
    return { valid: false, active: false, cnpj: cleaned, error: 'CNPJ deve ter 14 dígitos' };
  }

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleaned}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 404) {
      return { valid: false, active: false, cnpj: cleaned, error: 'CNPJ não encontrado na Receita Federal' };
    }

    if (!response.ok) {
      return { valid: false, active: false, cnpj: cleaned, error: `BrasilAPI error: ${response.status}` };
    }

    const data = await response.json() as Record<string, unknown>;

    // situacao_cadastral: "ATIVA" = válido
    const situacao = String(data.descricao_situacao_cadastral ?? data.situacao ?? '').toUpperCase();
    const active = situacao === 'ATIVA' || situacao === 'ATIVO';

    return {
      valid: active,
      active,
      cnpj: cleaned,
      razaoSocial: String(data.razao_social ?? data.nome ?? ''),
      situacao,
      abertura: String(data.data_inicio_atividade ?? data.abertura ?? ''),
      raw: data,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { valid: false, active: false, cnpj: cleaned, error };
  }
}
