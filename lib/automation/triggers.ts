/**
 * @fileoverview Automation Triggers
 *
 * Cria automation_schedules quando deals são criados, movidos de stage ou
 * recebem resposta. Apos criar as schedules, dispara o endpoint `run-now`
 * fire-and-forget para que o processador rode em < 2s (sem esperar o cron
 * de 15min).
 */

import { supabase } from '@/lib/supabase/client';
import { AutomationRule } from '@/types';

// =============================================================================
// Helpers
// =============================================================================

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Resolve a URL base do app para fetches server-side. No browser usamos URL
 * relativa (string vazia). Em Vercel/Node usamos NEXT_PUBLIC_APP_URL ou
 * monta a partir de VERCEL_URL. Sem nenhuma, faz no-op (nao bloqueia).
 */
function getAppBaseUrl(): string {
  if (typeof window !== 'undefined') return '';
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  return '';
}

/**
 * Dispara o endpoint /api/internal/automation/run-now sem aguardar resposta.
 * Modo session (sem body) no browser; modo schedule-id no server.
 */
function triggerRunNow(scheduleId?: string): void {
  try {
    const base = getAppBaseUrl();
    const url = `${base}/api/internal/automation/run-now`;
    const isServer = typeof window === 'undefined';
    const init: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: isServer && scheduleId ? JSON.stringify({ scheduleId }) : undefined,
      // Importante: nao manter o fetch vivo apos a resposta inicial.
      keepalive: !isServer,
    };
    // No server, so chamamos se conseguimos uma base URL valida.
    if (isServer && !base) return;
    void fetch(url, init).catch(() => undefined);
  } catch {
    // fire-and-forget — qualquer erro e ignorado
  }
}

async function getActiveRulesForBoard(
  boardId: string,
  triggerType: AutomationRule['triggerType'],
  stageId?: string
): Promise<AutomationRule[]> {
  if (!supabase) return [];

  let query = supabase
    .from('automation_rules')
    .select('*')
    .eq('board_id', boardId)
    .eq('trigger_type', triggerType)
    .eq('is_active', true);

  // Quando o trigger conhece a coluna (deal_created/stage_entered/days_in_stage),
  // só carregamos regras compatíveis: as ligadas àquela coluna OU as ligadas ao
  // board todo (stage_id IS NULL).
  if (stageId) {
    query = query.or(`stage_id.is.null,stage_id.eq.${stageId}`);
  }

  const { data, error } = await query.order('position', { ascending: true });

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    boardId: r.board_id,
    stageId: r.stage_id ?? null,
    name: r.name,
    triggerType: r.trigger_type,
    triggerConfig: r.trigger_config ?? {},
    conditionConfig: r.condition_config ?? {},
    actionType: r.action_type,
    actionConfig: r.action_config ?? {},
    isActive: r.is_active,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/** Insere uma schedule e retorna o ID criado (ou null em falha). */
async function createSchedule(params: {
  organizationId: string;
  ruleId: string;
  dealId: string;
  scheduledAt: Date;
}): Promise<string | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('automation_schedules')
    .insert({
      organization_id: params.organizationId,
      rule_id: params.ruleId,
      deal_id: params.dealId,
      scheduled_at: params.scheduledAt.toISOString(),
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !data) return null;
  return (data.id as string) ?? null;
}

// =============================================================================
// Cancelar schedules pendentes de um deal (ex: lead respondeu)
// =============================================================================

export async function cancelPendingSchedules(dealId: string): Promise<void> {
  if (!supabase) return;

  await supabase
    .from('automation_schedules')
    .update({ status: 'cancelled' })
    .eq('deal_id', dealId)
    .eq('status', 'pending');
}

// =============================================================================
// Trigger: deal criado
// =============================================================================

export async function onDealCreated(params: {
  dealId: string;
  boardId: string;
  organizationId: string;
  /** Coluna onde o deal foi criado. Quando informado, restringe regras à coluna. */
  stageId?: string;
}): Promise<void> {
  const rules = await getActiveRulesForBoard(params.boardId, 'deal_created', params.stageId);
  if (rules.length === 0) return;

  const now = new Date();
  let immediate = false;

  for (const rule of rules) {
    const scheduleId = await createSchedule({
      organizationId: params.organizationId,
      ruleId: rule.id,
      dealId: params.dealId,
      scheduledAt: now, // imediato
    });
    if (scheduleId) {
      immediate = true;
      // No server, dispara cada schedule individualmente (modo schedule-id).
      if (typeof window === 'undefined') triggerRunNow(scheduleId);
    }
  }

  // No browser, uma unica chamada modo session processa todas as schedules
  // da org de uma vez (mais eficiente que N fetches).
  if (immediate && typeof window !== 'undefined') triggerRunNow();
}

// =============================================================================
// Trigger: deal entrou em um stage
// =============================================================================

export async function onStageEntered(params: {
  dealId: string;
  boardId: string;
  stageId: string;
  organizationId: string;
}): Promise<void> {
  const rules = await getActiveRulesForBoard(params.boardId, 'stage_entered', params.stageId);
  const daysInStageRules = await getActiveRulesForBoard(params.boardId, 'days_in_stage', params.stageId);

  // Mantém o filtro legado por trigger_config.stageId (regras antigas que usam
  // JSONB em vez da coluna nova) — quem usar a coluna stage_id já foi filtrado no SQL.
  const allRules = [...rules, ...daysInStageRules].filter(
    (r) => !r.triggerConfig.stageId || r.triggerConfig.stageId === params.stageId
  );

  if (allRules.length === 0) return;

  // Cancela schedules anteriores do deal (novo stage, recomeça cadência)
  await cancelPendingSchedules(params.dealId);

  const now = new Date();
  let immediate = false;

  for (const rule of allRules) {
    const days = rule.triggerConfig.days ?? 0;
    const scheduledAt = days > 0 ? addDays(now, days) : now;

    const scheduleId = await createSchedule({
      organizationId: params.organizationId,
      ruleId: rule.id,
      dealId: params.dealId,
      scheduledAt,
    });
    // Schedules com delay (days > 0) ficam para o cron de 15min processar
    // quando o scheduled_at chegar. Sem delay, dispara imediato.
    if (scheduleId && days === 0) {
      immediate = true;
      if (typeof window === 'undefined') triggerRunNow(scheduleId);
    }
  }

  if (immediate && typeof window !== 'undefined') triggerRunNow();
}

// =============================================================================
// Trigger: lead respondeu (qualquer canal)
// Cancela cadência ativa e agenda ação de mover para funil de vendas
// =============================================================================

export async function onResponseReceived(params: {
  dealId: string;
  boardId: string;
  organizationId: string;
}): Promise<void> {
  // Cancela toda a cadência pendente
  await cancelPendingSchedules(params.dealId);

  // Busca regras de response_received para o board
  const rules = await getActiveRulesForBoard(params.boardId, 'response_received');
  if (rules.length === 0) return;

  const now = new Date();
  let immediate = false;

  for (const rule of rules) {
    const scheduleId = await createSchedule({
      organizationId: params.organizationId,
      ruleId: rule.id,
      dealId: params.dealId,
      scheduledAt: now, // imediato
    });
    if (scheduleId) {
      immediate = true;
      if (typeof window === 'undefined') triggerRunNow(scheduleId);
    }
  }

  if (immediate && typeof window !== 'undefined') triggerRunNow();
}
