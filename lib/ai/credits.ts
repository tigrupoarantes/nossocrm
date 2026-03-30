import { supabase } from '@/lib/supabase/client';

export const AI_CREDIT_COSTS = {
  super_agent_message: 1,
} as const;

// ============================================
// AI CREDITS SERVICE
// ============================================

export interface AICredits {
  balance: number;
  totalUsed: number;
  planLimit: number;
  resetAt: string | null;
}

export interface AICreditTransaction {
  id: string;
  type: 'debit' | 'credit' | 'refund';
  amount: number;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

/**
 * Busca o saldo de créditos da organização.
 */
export async function getCreditsBalance(organizationId: string): Promise<AICredits | null> {
  const { data, error } = await supabase
    .from('ai_credits')
    .select('balance, total_used, plan_limit, reset_at')
    .eq('organization_id', organizationId)
    .single();

  if (error || !data) return null;

  return {
    balance: data.balance,
    totalUsed: data.total_used,
    planLimit: data.plan_limit,
    resetAt: data.reset_at,
  };
}

/**
 * Verifica se há créditos suficientes.
 */
export async function hasEnoughCredits(
  organizationId: string,
  amount: number
): Promise<boolean> {
  const credits = await getCreditsBalance(organizationId);
  if (!credits) return false;
  return credits.balance >= amount;
}

/**
 * Deduz créditos (usa function atômica do Postgres).
 * Retorna true se sucesso, false se saldo insuficiente.
 */
export async function deductCredits(
  organizationId: string,
  amount: number,
  description?: string,
  referenceType?: string,
  referenceId?: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('deduct_ai_credits', {
    p_organization_id: organizationId,
    p_amount: amount,
    p_description: description ?? null,
    p_reference_type: referenceType ?? null,
    p_reference_id: referenceId ?? null,
  });

  if (error) {
    console.error('[credits] deductCredits error:', error);
    return false;
  }

  return data === true;
}

/**
 * Busca histórico de transações de créditos.
 */
export async function getCreditTransactions(
  organizationId: string,
  limit = 50
): Promise<AICreditTransaction[]> {
  const { data, error } = await supabase
    .from('ai_credit_transactions')
    .select('id, type, amount, description, reference_type, reference_id, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((t) => ({
    id: t.id,
    type: t.type as AICreditTransaction['type'],
    amount: t.amount,
    description: t.description,
    referenceType: t.reference_type,
    referenceId: t.reference_id,
    createdAt: t.created_at,
  }));
}

/**
 * Relatório de uso por tipo de referência.
 */
export async function getUsageReport(
  organizationId: string,
  days = 30
): Promise<Record<string, number>> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('ai_credit_transactions')
    .select('reference_type, amount')
    .eq('organization_id', organizationId)
    .eq('type', 'debit')
    .gte('created_at', since.toISOString());

  if (error || !data) return {};

  const report: Record<string, number> = {};
  for (const t of data) {
    const key = t.reference_type || 'other';
    report[key] = (report[key] || 0) + t.amount;
  }
  return report;
}
