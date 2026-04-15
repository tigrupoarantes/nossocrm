/**
 * @fileoverview Automation Engine
 *
 * Processador de schedules pendentes. Chamado pelo cron job a cada 15 minutos.
 * Busca automation_schedules com status='pending' e scheduled_at <= now(),
 * executa a ação correspondente e registra o resultado.
 *
 * @module lib/automation/engine
 */

import { createClient } from '@/lib/supabase/server';
import { AutomationRule, AutomationActionType } from '@/types';

// =============================================================================
// Types internos
// =============================================================================

interface PendingSchedule {
  id: string;
  organizationId: string;
  ruleId: string;
  dealId: string;
  scheduledAt: string;
  rule: {
    triggerType: string;
    actionType: AutomationActionType;
    actionConfig: AutomationRule['actionConfig'];
  };
}

interface ActionResult {
  success: boolean;
  result: Record<string, unknown>;
  error?: string;
}

// =============================================================================
// Buscar schedules pendentes
// =============================================================================

async function fetchPendingSchedules(supabase: Awaited<ReturnType<typeof createClient>>): Promise<PendingSchedule[]> {
  const { data, error } = await supabase
    .from('automation_schedules')
    .select(`
      id,
      organization_id,
      rule_id,
      deal_id,
      scheduled_at,
      automation_rules (
        trigger_type,
        action_type,
        action_config
      )
    `)
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .limit(50); // processar em lotes de 50 por execução

  if (error || !data) return [];

  return data.map((s: any) => ({
    id: s.id,
    organizationId: s.organization_id,
    ruleId: s.rule_id,
    dealId: s.deal_id,
    scheduledAt: s.scheduled_at,
    rule: {
      triggerType: s.automation_rules?.trigger_type ?? '',
      actionType: s.automation_rules?.action_type ?? '',
      actionConfig: s.automation_rules?.action_config ?? {},
    },
  }));
}

// =============================================================================
// Executores de ação (importados lazy para não aumentar bundle)
// =============================================================================

async function executeAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  schedule: PendingSchedule
): Promise<ActionResult> {
  const { actionType, actionConfig } = schedule.rule;

  try {
    switch (actionType) {
      case 'validate_cnpj': {
        const { orchestrateD0Validations } = await import('@/lib/integrations');
        const result = await orchestrateD0Validations(supabase, schedule.dealId, schedule.organizationId);
        return { success: true, result };
      }

      case 'check_serasa': {
        // executado junto com validate_cnpj via orchestrateD0Validations
        return { success: true, result: { skipped: 'handled_by_orchestrate' } };
      }

      case 'check_customer_base': {
        // executado junto com validate_cnpj via orchestrateD0Validations
        return { success: true, result: { skipped: 'handled_by_orchestrate' } };
      }

      case 'send_email': {
        const { sendAutomationEmail } = await import('@/lib/communication/email');
        const result = await sendAutomationEmail(supabase, {
          dealId: schedule.dealId,
          organizationId: schedule.organizationId,
          templateId: actionConfig.templateId ?? 'primeiro-contato',
        });
        return { success: true, result };
      }

      case 'send_whatsapp': {
        // Provider selection: WAHA (se configurado) → Twilio (fallback)
        const { data: orgSettings } = await supabase
          .from('organization_settings')
          .select('waha_config, twilio_config')
          .eq('organization_id', schedule.organizationId)
          .single();

        const wahaConfig = (orgSettings as any)?.waha_config;
        const twilioConfig = (orgSettings as any)?.twilio_config;
        const templateId = actionConfig.templateId ?? 'primeiro-contato';

        if (wahaConfig?.baseUrl) {
          const { sendAutomationWaha } = await import('@/lib/communication/waha');
          const result = await sendAutomationWaha(supabase, {
            dealId: schedule.dealId,
            organizationId: schedule.organizationId,
            templateId,
            bodyTemplate: actionConfig.body,
          });
          return { success: true, result };
        } else if (twilioConfig?.accountSid) {
          const { sendAutomationWhatsApp } = await import('@/lib/communication/whatsapp');
          const result = await sendAutomationWhatsApp(supabase, {
            dealId: schedule.dealId,
            organizationId: schedule.organizationId,
            templateId,
          });
          return { success: true, result };
        } else {
          throw new Error('No WhatsApp provider configured (WAHA or Twilio required)');
        }
      }

      case 'move_stage': {
        const result = await moveDealToStage(supabase, {
          dealId: schedule.dealId,
          stageId: actionConfig.stageId,
          toStageLabel: actionConfig.toStageLabel,
          organizationId: schedule.organizationId,
        });
        return { success: true, result };
      }

      case 'move_to_next_board': {
        const result = await moveDealToNextBoard(supabase, {
          dealId: schedule.dealId,
          toBoardId: actionConfig.toBoardId,
          toStageLabel: actionConfig.toStageLabel ?? 'LEAD QUENTE',
          organizationId: schedule.organizationId,
        });
        return { success: true, result };
      }

      default:
        return { success: false, result: {}, error: `Unknown action type: ${actionType}` };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, result: {}, error };
  }
}

// =============================================================================
// Move deal para um stage por ID ou label
// =============================================================================

async function moveDealToStage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    dealId: string;
    stageId?: string;
    toStageLabel?: string;
    organizationId: string;
  }
): Promise<Record<string, unknown>> {
  let targetStageId = params.stageId;

  // Resolver por label se não tiver ID direto
  if (!targetStageId && params.toStageLabel) {
    const { data: deal } = await supabase
      .from('deals')
      .select('board_id')
      .eq('id', params.dealId)
      .single();

    if (deal?.board_id) {
      const { data: stage } = await supabase
        .from('board_stages')
        .select('id')
        .eq('board_id', deal.board_id)
        .ilike('label', params.toStageLabel)
        .single();

      targetStageId = stage?.id;
    }
  }

  if (!targetStageId) {
    throw new Error(`Stage not found: ${params.toStageLabel ?? params.stageId}`);
  }

  const { error } = await supabase
    .from('deals')
    .update({ stage_id: targetStageId, last_stage_change_date: new Date().toISOString() })
    .eq('id', params.dealId);

  if (error) throw new Error(error.message);

  return { stageId: targetStageId };
}

// =============================================================================
// Move deal para o próximo board (funil de vendas conectado)
// =============================================================================

async function moveDealToNextBoard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    dealId: string;
    toBoardId?: string;
    toStageLabel: string;
    organizationId: string;
  }
): Promise<Record<string, unknown>> {
  // Busca deal atual
  const { data: deal } = await supabase
    .from('deals')
    .select('*, board_id, title, contact_id, client_company_id, value')
    .eq('id', params.dealId)
    .single();

  if (!deal) throw new Error('Deal not found');

  // Resolve o board de destino
  let targetBoardId = params.toBoardId;
  if (!targetBoardId) {
    const { data: board } = await supabase
      .from('boards')
      .select('next_board_id')
      .eq('id', deal.board_id)
      .single();
    targetBoardId = board?.next_board_id ?? undefined;
  }

  if (!targetBoardId) throw new Error('No target board configured');

  // Busca stage de destino por label no board alvo
  const { data: stage } = await supabase
    .from('board_stages')
    .select('id')
    .eq('board_id', targetBoardId)
    .ilike('label', params.toStageLabel)
    .single();

  if (!stage) throw new Error(`Stage '${params.toStageLabel}' not found in target board`);

  // Cria deal no board de vendas
  const { data: newDeal, error } = await supabase
    .from('deals')
    .insert({
      organization_id: params.organizationId,
      board_id: targetBoardId,
      stage_id: stage.id,
      title: deal.title,
      contact_id: deal.contact_id,
      client_company_id: deal.client_company_id,
      value: deal.value,
      custom_fields: {
        ...((deal.custom_fields as Record<string, unknown>) ?? {}),
        origin_deal_id: params.dealId,
        origin_board_id: deal.board_id,
        origin_automation: 'response_received',
      },
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  return { newDealId: newDeal?.id, targetBoardId, stageId: stage.id };
}

// =============================================================================
// Registrar execução
// =============================================================================

async function recordExecution(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    scheduleId: string;
    ruleId: string;
    dealId: string;
    organizationId: string;
    actionType: string;
    actionResult: ActionResult;
  }
): Promise<void> {
  await supabase.from('automation_executions').insert({
    organization_id: params.organizationId,
    schedule_id: params.scheduleId,
    rule_id: params.ruleId,
    deal_id: params.dealId,
    action_type: params.actionType,
    result: params.actionResult.error
      ? { ...params.actionResult.result, error: params.actionResult.error }
      : params.actionResult.result,
    success: params.actionResult.success,
    executed_at: new Date().toISOString(),
  });
}

// =============================================================================
// Função principal — chamada pelo cron endpoint
// =============================================================================

export async function processAutomationSchedules(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const supabase = await createClient();
  const schedules = await fetchPendingSchedules(supabase);

  let succeeded = 0;
  let failed = 0;

  for (const schedule of schedules) {
    // Marca como "em execução" (previne dupla execução em caso de concorrência)
    await supabase
      .from('automation_schedules')
      .update({ status: 'executed', executed_at: new Date().toISOString() })
      .eq('id', schedule.id)
      .eq('status', 'pending');

    const actionResult = await executeAction(supabase, schedule);

    await recordExecution(supabase, {
      scheduleId: schedule.id,
      ruleId: schedule.ruleId,
      dealId: schedule.dealId,
      organizationId: schedule.organizationId,
      actionType: schedule.rule.actionType,
      actionResult,
    });

    if (actionResult.success) {
      succeeded++;
    } else {
      failed++;
      // Reabilita como failed para diagnóstico
      await supabase
        .from('automation_schedules')
        .update({ status: 'failed', error: actionResult.error ?? null })
        .eq('id', schedule.id);
    }
  }

  return { processed: schedules.length, succeeded, failed };
}
