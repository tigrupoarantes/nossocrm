/**
 * @fileoverview Orquestrador de validações D+0
 *
 * Executa as 3 validações do dia zero em sequência:
 * 1. CNPJ (BrasilAPI) → inválido → move para REVISÃO
 * 2. SERASA → abaixo do mínimo → move para DESQUALIFICADO
 * 3. Base FLAG/SAP → registra no card (não bloqueia)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { validateCNPJ } from './cnpj';
import { checkCredit, SerasaConfig } from './serasa';
import { checkActiveCustomer, CustomerBaseConfig } from './customer-base';

export { validateCNPJ } from './cnpj';
export { checkCredit } from './serasa';
export { checkActiveCustomer } from './customer-base';

export interface D0ValidationResult {
  cnpj: { valid: boolean; situacao?: string; error?: string };
  serasa: { approved: boolean; score: number | null; error?: string } | null;
  customerBase: { isActiveCustomer: boolean; error?: string } | null;
  movedToStage: string | null;
}

/**
 * Orquestra todas as validações D+0 para um deal.
 * Move o deal para o stage correto conforme resultado das validações.
 */
export async function orchestrateD0Validations(
  supabase: SupabaseClient,
  dealId: string,
  organizationId: string
): Promise<D0ValidationResult> {
  // 1. Buscar deal + CNPJ do contato/empresa
  const { data: deal } = await supabase
    .from('deals')
    .select(`
      id, board_id,
      contacts(name, email),
      crm_companies(cnpj, name),
      custom_fields
    `)
    .eq('id', dealId)
    .single();

  if (!deal) throw new Error('Deal not found');

  const cnpj = (deal as any).crm_companies?.cnpj ?? (deal as any).custom_fields?.cnpj ?? '';

  // 2. Buscar configurações da organização
  const { data: settings } = await supabase
    .from('organization_settings')
    .select('serasa_config, customer_base_config')
    .eq('organization_id', organizationId)
    .single();

  const serasaConfig = (settings as any)?.serasa_config as SerasaConfig | null;
  const customerBaseConfig = (settings as any)?.customer_base_config as CustomerBaseConfig | null;

  const result: D0ValidationResult = {
    cnpj: { valid: false },
    serasa: null,
    customerBase: null,
    movedToStage: null,
  };

  // 3. Validar CNPJ (BrasilAPI)
  if (cnpj) {
    const cnpjResult = await validateCNPJ(cnpj);
    result.cnpj = { valid: cnpjResult.valid, situacao: cnpjResult.situacao, error: cnpjResult.error };

    if (!cnpjResult.valid) {
      // Mover para REVISÃO
      await moveDealToStageByLabel(supabase, dealId, (deal as any).board_id, 'Revisão');
      result.movedToStage = 'REVISAO';

      // Salvar resultado no custom_fields do deal
      await supabase.from('deals').update({
        custom_fields: {
          ...((deal as any).custom_fields ?? {}),
          cnpj_validation: { valid: false, situacao: cnpjResult.situacao, error: cnpjResult.error, checked_at: new Date().toISOString() },
        },
      }).eq('id', dealId);

      return result; // Para aqui — CNPJ inválido
    }

    // Salvar resultado positivo
    await supabase.from('deals').update({
      custom_fields: {
        ...((deal as any).custom_fields ?? {}),
        cnpj_validation: { valid: true, situacao: cnpjResult.situacao, razao_social: cnpjResult.razaoSocial, checked_at: new Date().toISOString() },
      },
    }).eq('id', dealId);
  }

  // 4. Consultar SERASA (se configurado)
  if (serasaConfig?.clientId && cnpj) {
    const serasaResult = await checkCredit(cnpj, serasaConfig);
    result.serasa = { approved: serasaResult.approved, score: serasaResult.score, error: serasaResult.error };

    await supabase.from('deals').update({
      custom_fields: {
        ...((deal as any).custom_fields ?? {}),
        serasa_result: {
          approved: serasaResult.approved,
          score: serasaResult.score,
          minimum_score: serasaConfig.minimumScore,
          checked_at: serasaResult.consultedAt,
          error: serasaResult.error,
        },
      },
    }).eq('id', dealId);

    if (!serasaResult.approved) {
      await moveDealToStageByLabel(supabase, dealId, (deal as any).board_id, 'Desqualificado');
      result.movedToStage = 'DESQUALIFICADO';
      return result;
    }
  }

  // 5. Verificar base FLAG/SAP (se configurado) — apenas registra, não bloqueia
  if (customerBaseConfig?.baseUrl && cnpj) {
    const baseResult = await checkActiveCustomer(cnpj, customerBaseConfig);
    result.customerBase = { isActiveCustomer: baseResult.isActiveCustomer, error: baseResult.error };

    await supabase.from('deals').update({
      custom_fields: {
        ...((deal as any).custom_fields ?? {}),
        customer_base_check: {
          is_active_customer: baseResult.isActiveCustomer,
          customer_code: baseResult.customerCode,
          customer_name: baseResult.customerName,
          checked_at: baseResult.consultedAt,
          error: baseResult.error,
        },
      },
    }).eq('id', dealId);
  }

  return result;
}

// =============================================================================
// Helper: move deal para stage por label
// =============================================================================

async function moveDealToStageByLabel(
  supabase: SupabaseClient,
  dealId: string,
  boardId: string,
  stageLabel: string
): Promise<void> {
  const { data: stage } = await supabase
    .from('board_stages')
    .select('id')
    .eq('board_id', boardId)
    .ilike('label', stageLabel)
    .maybeSingle();

  if (stage?.id) {
    await supabase
      .from('deals')
      .update({ stage_id: stage.id, last_stage_change_date: new Date().toISOString() })
      .eq('id', dealId);
  }
}
