/**
 * @fileoverview Verificação de base de clientes ativos (FLAG x SAP)
 *
 * Consulta se um CNPJ já é cliente ativo na base FLAG/SAP.
 * Credenciais configuradas em organization_settings.customer_base_config.
 */

export interface CustomerBaseConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export interface CustomerBaseResult {
  isActiveCustomer: boolean;
  cnpj: string;
  customerCode?: string;
  customerName?: string;
  consultedAt: string;
  raw?: Record<string, unknown>;
  error?: string;
}

/**
 * Verifica se CNPJ existe como cliente ativo na base FLAG/SAP.
 */
export async function checkActiveCustomer(
  cnpj: string,
  config: CustomerBaseConfig
): Promise<CustomerBaseResult> {
  const cleaned = cnpj.replace(/\D/g, '');
  const consultedAt = new Date().toISOString();

  try {
    const response = await fetch(`${config.baseUrl}/customers/${cleaned}`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
    });

    if (response.status === 404) {
      return { isActiveCustomer: false, cnpj: cleaned, consultedAt };
    }

    if (!response.ok) {
      return {
        isActiveCustomer: false,
        cnpj: cleaned,
        consultedAt,
        error: `Customer base error: ${response.status}`,
      };
    }

    const data = await response.json() as Record<string, unknown>;

    return {
      isActiveCustomer: true,
      cnpj: cleaned,
      customerCode: String((data as any)?.code ?? (data as any)?.codigo ?? ''),
      customerName: String((data as any)?.name ?? (data as any)?.nome ?? ''),
      consultedAt,
      raw: data,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { isActiveCustomer: false, cnpj: cleaned, consultedAt, error };
  }
}
