/**
 * @fileoverview Integração com SERASA Experian
 *
 * Consulta de crédito empresarial via SERASA API.
 * Credenciais configuradas em organization_settings.serasa_config.
 */

export interface SerasaConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  minimumScore: number; // score mínimo para aprovação
}

export interface SerasaResult {
  approved: boolean;
  score: number | null;
  cnpj: string;
  consultedAt: string;
  raw?: Record<string, unknown>;
  error?: string;
}

/**
 * Obtém token OAuth da SERASA API.
 */
async function getSerasaToken(config: SerasaConfig): Promise<string> {
  const response = await fetch(`${config.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`SERASA auth failed: ${response.status}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

/**
 * Consulta score de crédito empresarial na SERASA.
 * Retorna approved=false se score abaixo do mínimo configurado.
 */
export async function checkCredit(cnpj: string, config: SerasaConfig): Promise<SerasaResult> {
  const cleaned = cnpj.replace(/\D/g, '');
  const consultedAt = new Date().toISOString();

  try {
    const token = await getSerasaToken(config);

    const response = await fetch(`${config.baseUrl}/v1/consultations/cnpj/${cleaned}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return {
        approved: false,
        score: null,
        cnpj: cleaned,
        consultedAt,
        error: `SERASA API error: ${response.status}`,
      };
    }

    const data = await response.json() as Record<string, unknown>;

    // Tentar extrair score de diferentes formatos de resposta da SERASA
    const score = Number(
      (data as any)?.score ??
      (data as any)?.scoreCredito ??
      (data as any)?.pontuacao ??
      null
    );

    const approved = !isNaN(score) && score >= config.minimumScore;

    return {
      approved,
      score: isNaN(score) ? null : score,
      cnpj: cleaned,
      consultedAt,
      raw: data,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { approved: false, score: null, cnpj: cleaned, consultedAt, error };
  }
}
