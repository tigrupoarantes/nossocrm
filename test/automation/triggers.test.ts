/**
 * Testes unitários — lib/automation/triggers.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted garante que as variáveis estejam disponíveis após o hoist do vi.mock
// ---------------------------------------------------------------------------

const { insertMock, fromMock, rulesHolder } = vi.hoisted(() => {
  const insertMock = vi.fn(async () => ({ error: null }))
  const rulesHolder: { data: unknown[] } = { data: [] }

   
  const fromMock = vi.fn((_table: string): any => {
    if (_table === 'automation_rules') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn(async () => ({ data: rulesHolder.data, error: null })),
      }
    }
    // automation_schedules e fallback
    return {
      insert: insertMock,
      update: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      })),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data: null, error: null })),
    }
  })

  return { insertMock, fromMock, rulesHolder }
})

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: fromMock },
}))

import {
  onDealCreated,
  onStageEntered,
  onResponseReceived,
  cancelPendingSchedules,
} from '@/lib/automation/triggers'

// ---------------------------------------------------------------------------

 
function makeRule(overrides: Record<string, any> = {}) {
  return {
    id: 'rule-1',
    organization_id: 'org-1',
    board_id: 'board-1',
    name: 'Regra Teste',
    trigger_type: 'deal_created',
    trigger_config: { days: 0 },
    condition_config: {},
    action_type: 'send_email',
    action_config: {},
    is_active: true,
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  rulesHolder.data = []
})

// ---------------------------------------------------------------------------
// cancelPendingSchedules
// ---------------------------------------------------------------------------

describe('cancelPendingSchedules', () => {
  it('chama update com status cancelled no deal correto', async () => {
    const statusEqMock = vi.fn(async () => ({ error: null }))
    const dealEqMock = vi.fn(() => ({ eq: statusEqMock }))
     
    ;(fromMock as any).mockReturnValueOnce({ update: vi.fn(() => ({ eq: dealEqMock })) })

    await cancelPendingSchedules('deal-abc')

    expect(dealEqMock).toHaveBeenCalledWith('deal_id', 'deal-abc')
    expect(statusEqMock).toHaveBeenCalledWith('status', 'pending')
  })
})

// ---------------------------------------------------------------------------
// onDealCreated
// ---------------------------------------------------------------------------

describe('onDealCreated', () => {
  it('não cria schedules quando não há regras deal_created no board', async () => {
    rulesHolder.data = []
    await onDealCreated({ dealId: 'deal-1', boardId: 'board-1', organizationId: 'org-1' })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('cria um schedule imediato por regra deal_created encontrada', async () => {
    rulesHolder.data = [makeRule({ trigger_type: 'deal_created' })]

    await onDealCreated({ dealId: 'deal-1', boardId: 'board-1', organizationId: 'org-1' })

    expect(insertMock).toHaveBeenCalledOnce()
     
    const payload = (insertMock.mock.calls as any[])[0][0] as Record<string, unknown>
    expect(payload.deal_id).toBe('deal-1')
    expect(payload.organization_id).toBe('org-1')
    expect(payload.rule_id).toBe('rule-1')
    expect(payload.status).toBe('pending')
    expect(new Date(payload.scheduled_at as string).getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('cria um schedule por cada regra existente', async () => {
    rulesHolder.data = [
      makeRule({ id: 'rule-1', trigger_type: 'deal_created' }),
      makeRule({ id: 'rule-2', trigger_type: 'deal_created', action_type: 'check_serasa' }),
    ]
    await onDealCreated({ dealId: 'deal-1', boardId: 'board-1', organizationId: 'org-1' })
    expect(insertMock).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// onStageEntered
// ---------------------------------------------------------------------------

describe('onStageEntered', () => {
  it('não cria schedules quando não há regras para o board', async () => {
    rulesHolder.data = []
    await onStageEntered({ dealId: 'deal-2', boardId: 'board-1', stageId: 'stage-x', organizationId: 'org-1' })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('cria schedule com delay de 3 dias quando triggerConfig.days = 3', async () => {
    rulesHolder.data = [makeRule({ trigger_type: 'days_in_stage', trigger_config: { days: 3, stageId: 'stage-lead' } })]

    const before = Date.now()
    await onStageEntered({ dealId: 'deal-2', boardId: 'board-1', stageId: 'stage-lead', organizationId: 'org-1' })

    // onStageEntered busca stage_entered + days_in_stage em 2 queries;
    // com mock sem discriminação de trigger_type, a regra é retornada por ambas → 2 inserts.
    expect(insertMock).toHaveBeenCalled()
     
    const payload = (insertMock.mock.calls as any[])[0][0] as Record<string, unknown>
    const scheduledAt = new Date(payload.scheduled_at as string).getTime()
    expect(scheduledAt).toBeGreaterThan(before + 3 * 24 * 60 * 60 * 1000 - 1000)
  })

  it('ignora regras cujo stageId não corresponde ao stage atual', async () => {
    rulesHolder.data = [makeRule({ trigger_type: 'days_in_stage', trigger_config: { days: 1, stageId: 'outro-stage' } })]
    await onStageEntered({ dealId: 'deal-2', boardId: 'board-1', stageId: 'stage-lead', organizationId: 'org-1' })
    expect(insertMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// onResponseReceived
// ---------------------------------------------------------------------------

describe('onResponseReceived', () => {
  it('não cria schedules quando não há regras response_received', async () => {
    rulesHolder.data = []
    await onResponseReceived({ dealId: 'deal-3', boardId: 'board-1', organizationId: 'org-1' })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('agenda ação de mover para próximo funil imediatamente', async () => {
    rulesHolder.data = [makeRule({ trigger_type: 'response_received', action_type: 'move_to_next_board', action_config: { toStageLabel: 'LEAD QUENTE' } })]

    await onResponseReceived({ dealId: 'deal-3', boardId: 'board-1', organizationId: 'org-1' })

    expect(insertMock).toHaveBeenCalledOnce()
     
    const payload = (insertMock.mock.calls as any[])[0][0] as Record<string, unknown>
    expect(payload.deal_id).toBe('deal-3')
    expect(payload.status).toBe('pending')
    expect(new Date(payload.scheduled_at as string).getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })
})
