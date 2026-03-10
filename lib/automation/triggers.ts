/**
 * @fileoverview Automation Triggers
 *
 * Cria automation_schedules quando deals são criados ou movidos de stage.
 * Chamado pelos hooks de deal creation e stage movement.
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

async function getActiveRulesForBoard(
  boardId: string,
  triggerType: AutomationRule['triggerType']
): Promise<AutomationRule[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('board_id', boardId)
    .eq('trigger_type', triggerType)
    .eq('is_active', true)
    .order('position', { ascending: true });

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    boardId: r.board_id,
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

async function createSchedule(params: {
  organizationId: string;
  ruleId: string;
  dealId: string;
  scheduledAt: Date;
}): Promise<void> {
  if (!supabase) return;

  await supabase.from('automation_schedules').insert({
    organization_id: params.organizationId,
    rule_id: params.ruleId,
    deal_id: params.dealId,
    scheduled_at: params.scheduledAt.toISOString(),
    status: 'pending',
  });
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
}): Promise<void> {
  const rules = await getActiveRulesForBoard(params.boardId, 'deal_created');
  if (rules.length === 0) return;

  const now = new Date();

  for (const rule of rules) {
    await createSchedule({
      organizationId: params.organizationId,
      ruleId: rule.id,
      dealId: params.dealId,
      scheduledAt: now, // imediato
    });
  }
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
  const rules = await getActiveRulesForBoard(params.boardId, 'stage_entered');
  const daysInStageRules = await getActiveRulesForBoard(params.boardId, 'days_in_stage');

  const allRules = [...rules, ...daysInStageRules].filter(
    (r) => !r.triggerConfig.stageId || r.triggerConfig.stageId === params.stageId
  );

  if (allRules.length === 0) return;

  // Cancela schedules anteriores do deal (novo stage, recomeça cadência)
  await cancelPendingSchedules(params.dealId);

  const now = new Date();

  for (const rule of allRules) {
    const days = rule.triggerConfig.days ?? 0;
    const scheduledAt = days > 0 ? addDays(now, days) : now;

    await createSchedule({
      organizationId: params.organizationId,
      ruleId: rule.id,
      dealId: params.dealId,
      scheduledAt,
    });
  }
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

  for (const rule of rules) {
    await createSchedule({
      organizationId: params.organizationId,
      ruleId: rule.id,
      dealId: params.dealId,
      scheduledAt: now, // imediato
    });
  }
}
