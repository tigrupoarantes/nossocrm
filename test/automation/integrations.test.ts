/**
 * Testes unitários — lib/integrations/ (CNPJ, SERASA, FLAG/SAP, orquestrador D+0)
 *
 * Simula fetch para testar a lógica de validação sem chamar APIs externas.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// ---------------------------------------------------------------------------
// Factory de mock do Supabase (para orchestrateD0Validations)
// ---------------------------------------------------------------------------

 
function makeSupa(opts: { serasaConfig?: unknown } = {}): any {
  return {
    from: (_table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      maybeSingle: vi.fn(async () => ({ data: { id: 'stage-revisao' }, error: null })),
      single: vi.fn(async () => {
        if (_table === 'deals') {
          return {
            data: { id: 'deal-1', board_id: 'board-1', organization_id: 'org-1', custom_fields: { cnpj: '11222333000181' } },
            error: null,
          }
        }
        if (_table === 'organization_settings') {
          return {
            data: { serasa_config: opts.serasaConfig ?? null, customer_base_config: null },
            error: null,
          }
        }
        return { data: null, error: null }
      }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// validateCNPJ
// ---------------------------------------------------------------------------

describe('validateCNPJ', () => {
  it('retorna valid:true e active:true para CNPJ ativo', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ cnpj: '11222333000181', descricao_situacao_cadastral: 'ATIVA', razao_social: 'EMPRESA TESTE LTDA' }),
    })

    const { validateCNPJ } = await import('@/lib/integrations/cnpj')
    const result = await validateCNPJ('11.222.333/0001-81')

    expect(result.valid).toBe(true)
    expect(result.active).toBe(true)
    expect(result.razaoSocial).toBe('EMPRESA TESTE LTDA')
    expect((fetchMock.mock.calls[0] as string[])[0]).toContain('brasilapi.com.br')
  })

  it('retorna valid:false e active:false para situação BAIXADA', async () => {
    // Implementação: valid === active (só ATIVA é válido)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ cnpj: '11222333000181', descricao_situacao_cadastral: 'BAIXADA', razao_social: 'ENCERRADA LTDA' }),
    })

    const { validateCNPJ } = await import('@/lib/integrations/cnpj')
    const result = await validateCNPJ('11222333000181')

    expect(result.valid).toBe(false)
    expect(result.active).toBe(false)
  })

  it('retorna valid:false quando BrasilAPI retorna 404', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })

    const { validateCNPJ } = await import('@/lib/integrations/cnpj')
    const result = await validateCNPJ('00000000000000')

    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('retorna valid:false com error quando fetch lança exceção', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'))

    const { validateCNPJ } = await import('@/lib/integrations/cnpj')
    const result = await validateCNPJ('11222333000181')

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Network error')
  })
})

// ---------------------------------------------------------------------------
// checkCredit (SERASA)
// ---------------------------------------------------------------------------

describe('checkCredit', () => {
  const serasaConf = { clientId: 'cid', clientSecret: 'secret', baseUrl: 'https://api.serasa.mock', minimumScore: 500 }

  it('retorna approved:true quando score está acima do mínimo', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) })
    // Implementação: data?.score ?? data?.scoreCredito ?? data?.pontuacao
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ pontuacao: 750 }) })

    const { checkCredit } = await import('@/lib/integrations/serasa')
    const result = await checkCredit('11222333000181', serasaConf)

    expect(result.approved).toBe(true)
    expect(result.score).toBe(750)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retorna approved:false quando score está abaixo do mínimo', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ pontuacao: 200 }) })

    const { checkCredit } = await import('@/lib/integrations/serasa')
    const result = await checkCredit('11222333000181', serasaConf)

    expect(result.approved).toBe(false)
    expect(result.score).toBe(200)
  })

  it('retorna approved:false com error quando OAuth falha', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'invalid_client' }) })

    const { checkCredit } = await import('@/lib/integrations/serasa')
    const result = await checkCredit('11222333000181', serasaConf)

    expect(result.approved).toBe(false)
    expect(result.error).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// orchestrateD0Validations
// result.cnpj = { valid, situacao, error } — sem campo "active" no D0ValidationResult
// ---------------------------------------------------------------------------

describe('orchestrateD0Validations', () => {
  it('retorna cnpj.valid:true e movedToStage:null quando CNPJ ativo e sem SERASA configurado', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ cnpj: '11222333000181', descricao_situacao_cadastral: 'ATIVA', razao_social: 'OK LTDA' }),
    })

    const { orchestrateD0Validations } = await import('@/lib/integrations')
    const result = await orchestrateD0Validations(makeSupa(), 'deal-1', 'org-1')

    expect(result.cnpj.valid).toBe(true)
    expect(result.movedToStage).toBeNull()
  })

  it('retorna cnpj.valid:false e movedToStage:REVISAO quando CNPJ inativo', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ cnpj: '11222333000181', descricao_situacao_cadastral: 'BAIXADA', razao_social: 'BAIXADA LTDA' }),
    })

    const { orchestrateD0Validations } = await import('@/lib/integrations')
    const result = await orchestrateD0Validations(makeSupa(), 'deal-1', 'org-1')

    expect(result.cnpj.valid).toBe(false)
    expect(result.movedToStage).toBe('REVISAO')
  })

  it('não lança exceção quando BrasilAPI está offline (graceful degradation)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network timeout'))

    const { orchestrateD0Validations } = await import('@/lib/integrations')
    const result = await orchestrateD0Validations(makeSupa(), 'deal-1', 'org-1')

    expect(result.cnpj.valid).toBe(false)
    expect(result.cnpj.error).toContain('Network timeout')
    // Não deve lançar — apenas registra o erro no resultado
  })
})
