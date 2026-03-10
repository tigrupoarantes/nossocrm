/**
 * Testes unitários — lib/automation/engine.ts
 *
 * Simula o cliente Supabase do servidor e os módulos de comunicação/integração
 * para verificar que processAutomationSchedules:
 * - Busca schedules pending corretamente
 * - Executa a ação e registra em automation_executions
 * - Marca como 'executed' (sucesso) ou 'failed' (erro)
 * - Lida com lote vazio sem erros
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock do Supabase server
// ---------------------------------------------------------------------------

const insertExecMock = vi.fn(async () => ({ error: null }))
const updateScheduleMock = vi.fn(async () => ({ error: null }))

// Builder genérico para encadear .eq()
function makeUpdateBuilder() {
  const builder: Record<string, unknown> = {}
  builder.eq = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
  return builder
}

let pendingSchedules: unknown[] = []

const supabaseMock = {
  from: vi.fn((table: string) => {
    if (table === 'automation_schedules') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        limit: vi.fn(async () => ({ data: pendingSchedules, error: null })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        })),
      }
    }
    if (table === 'automation_executions') {
      return { insert: insertExecMock }
    }
    if (table === 'deals') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({
          data: {
            id: 'deal-1',
            board_id: 'board-1',
            organization_id: 'org-1',
            title: 'Deal Teste',
            contact_id: 'contact-1',
            client_company_id: null,
            value: 5000,
            custom_fields: {},
          },
          error: null,
        })),
      }
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data: null, error: null })),
    }
  }),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabaseMock,
}))

// ---------------------------------------------------------------------------
// Mock dos módulos de ação (sem chamadas reais a Twilio/SMTP/APIs)
// ---------------------------------------------------------------------------

vi.mock('@/lib/communication/email', () => ({
  sendAutomationEmail: vi.fn(async () => ({ messageId: 'mock-email-id' })),
}))

vi.mock('@/lib/communication/whatsapp', () => ({
  sendAutomationWhatsApp: vi.fn(async () => ({ sid: 'mock-whatsapp-sid' })),
}))

vi.mock('@/lib/integrations', () => ({
  orchestrateD0Validations: vi.fn(async () => ({
    cnpj: { valid: true },
    serasa: { approved: true, score: 750 },
    customerBase: { isActive: false },
  })),
}))

import { processAutomationSchedules } from '@/lib/automation/engine'

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  pendingSchedules = []
})

// ---------------------------------------------------------------------------

describe('processAutomationSchedules', () => {
  it('retorna zeros quando não há schedules pendentes', async () => {
    pendingSchedules = []
    const result = await processAutomationSchedules()
    expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0 })
  })

  it('executa ação send_email e registra sucesso', async () => {
    pendingSchedules = [
      {
        id: 'sched-1',
        organization_id: 'org-1',
        rule_id: 'rule-1',
        deal_id: 'deal-1',
        scheduled_at: new Date().toISOString(),
        automation_rules: {
          trigger_type: 'stage_entered',
          action_type: 'send_email',
          action_config: { templateId: 'primeiro-contato' },
        },
      },
    ]

    const result = await processAutomationSchedules()

    expect(result.processed).toBe(1)
    expect(result.succeeded).toBe(1)
    expect(result.failed).toBe(0)
    expect(insertExecMock).toHaveBeenCalledOnce()

    const exec = insertExecMock.mock.calls[0][0]
    expect(exec.action_type).toBe('send_email')
    expect(exec.success).toBe(true)
  })

  it('executa ação send_whatsapp e registra sucesso', async () => {
    pendingSchedules = [
      {
        id: 'sched-2',
        organization_id: 'org-1',
        rule_id: 'rule-2',
        deal_id: 'deal-1',
        scheduled_at: new Date().toISOString(),
        automation_rules: {
          trigger_type: 'days_in_stage',
          action_type: 'send_whatsapp',
          action_config: {},
        },
      },
    ]

    const result = await processAutomationSchedules()

    expect(result.succeeded).toBe(1)
    const exec = insertExecMock.mock.calls[0][0]
    expect(exec.action_type).toBe('send_whatsapp')
    expect(exec.success).toBe(true)
  })

  it('executa validate_cnpj via orchestrateD0Validations', async () => {
    const { orchestrateD0Validations } = await import('@/lib/integrations')

    pendingSchedules = [
      {
        id: 'sched-3',
        organization_id: 'org-1',
        rule_id: 'rule-3',
        deal_id: 'deal-1',
        scheduled_at: new Date().toISOString(),
        automation_rules: {
          trigger_type: 'deal_created',
          action_type: 'validate_cnpj',
          action_config: {},
        },
      },
    ]

    const result = await processAutomationSchedules()

    expect(result.succeeded).toBe(1)
    expect(orchestrateD0Validations).toHaveBeenCalledWith(
      supabaseMock,
      'deal-1',
      'org-1'
    )
  })

  it('marca como failed e registra erro quando ação lança exceção', async () => {
    const { sendAutomationEmail } = await import('@/lib/communication/email')
    vi.mocked(sendAutomationEmail).mockRejectedValueOnce(new Error('SMTP connection refused'))

    pendingSchedules = [
      {
        id: 'sched-fail',
        organization_id: 'org-1',
        rule_id: 'rule-4',
        deal_id: 'deal-1',
        scheduled_at: new Date().toISOString(),
        automation_rules: {
          trigger_type: 'stage_entered',
          action_type: 'send_email',
          action_config: {},
        },
      },
    ]

    const result = await processAutomationSchedules()

    expect(result.processed).toBe(1)
    expect(result.succeeded).toBe(0)
    expect(result.failed).toBe(1)

    const exec = insertExecMock.mock.calls[0][0]
    expect(exec.success).toBe(false)
    expect(exec.result?.error).toContain('SMTP connection refused')
  })

  it('processa múltiplos schedules em sequência', async () => {
    pendingSchedules = [
      {
        id: 'sched-a',
        organization_id: 'org-1',
        rule_id: 'rule-1',
        deal_id: 'deal-1',
        scheduled_at: new Date().toISOString(),
        automation_rules: { trigger_type: 'stage_entered', action_type: 'send_email', action_config: {} },
      },
      {
        id: 'sched-b',
        organization_id: 'org-1',
        rule_id: 'rule-2',
        deal_id: 'deal-1',
        scheduled_at: new Date().toISOString(),
        automation_rules: { trigger_type: 'days_in_stage', action_type: 'send_whatsapp', action_config: {} },
      },
    ]

    const result = await processAutomationSchedules()

    expect(result.processed).toBe(2)
    expect(result.succeeded).toBe(2)
    expect(result.failed).toBe(0)
    expect(insertExecMock).toHaveBeenCalledTimes(2)
  })
})
