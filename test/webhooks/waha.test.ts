/**
 * Testes unitários — app/api/webhooks/waha/route.ts
 *
 * Valida tratamento de eventos WAHA, normalização de telefone,
 * persistência de mensagens e disparo de onResponseReceived.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock: createStaticAdminClient
// ---------------------------------------------------------------------------

const upsertConvMock = vi.fn(async () => ({ data: { id: 'conv-1', unread_count: 0 }, error: null }))
const upsertMsgMock = vi.fn(async () => ({ data: null, error: null }))
const updateConvMock = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))

const contactsQueryMock = vi.fn(async () => ({ data: [], error: null }))
const dealsQueryMock = vi.fn(async () => ({ data: [], error: null }))

const supabaseMock = {
  from: vi.fn((table: string) => {
    if (table === 'contacts') {
      return {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        limit: contactsQueryMock,
      }
    }
    if (table === 'deals') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        limit: dealsQueryMock,
      }
    }
    if (table === 'conversations') {
      return {
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: upsertConvMock,
          })),
        })),
        update: updateConvMock,
      }
    }
    if (table === 'messages') {
      return {
        upsert: upsertMsgMock,
      }
    }
    return {}
  }),
}

vi.mock('@/lib/supabase/server', () => ({
  createStaticAdminClient: vi.fn(() => supabaseMock),
  createClient: vi.fn(() => supabaseMock),
}))

// ---------------------------------------------------------------------------
// Mock: onResponseReceived
// ---------------------------------------------------------------------------

const onResponseReceivedMock = vi.fn(async () => undefined)
vi.mock('@/lib/automation/triggers', () => ({
  onResponseReceived: onResponseReceivedMock,
}))

// ---------------------------------------------------------------------------
// Helpers para construir Request
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/webhooks/waha', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  // Garantir que o segredo não vaza entre testes
  delete process.env.WAHA_WEBHOOK_SECRET
  // Resetar mocks para estado padrão (sem deal encontrado)
  contactsQueryMock.mockResolvedValue({ data: [], error: null })
  dealsQueryMock.mockResolvedValue({ data: [], error: null })
  upsertConvMock.mockResolvedValue({ data: { id: 'conv-1', unread_count: 0 }, error: null })
  upsertMsgMock.mockResolvedValue({ data: null, error: null })
  updateConvMock.mockReturnValue({ eq: vi.fn(async () => ({ error: null })) })
})

// ---------------------------------------------------------------------------
// normalizeWahaPhone
// ---------------------------------------------------------------------------

describe('normalizeWahaPhone', () => {
  it('remove @c.us e mantém só dígitos', async () => {
    const { normalizeWahaPhone } = await import('@/app/api/webhooks/waha/route')
    expect(normalizeWahaPhone('5511999990000@c.us')).toBe('5511999990000')
  })

  it('remove whatsapp: prefix', async () => {
    const { normalizeWahaPhone } = await import('@/app/api/webhooks/waha/route')
    expect(normalizeWahaPhone('whatsapp:+5511999990000')).toBe('5511999990000')
  })

  it('mantém apenas dígitos de número com espaços', async () => {
    const { normalizeWahaPhone } = await import('@/app/api/webhooks/waha/route')
    expect(normalizeWahaPhone('+55 11 99999-0000')).toBe('5511999990000')
  })
})

// ---------------------------------------------------------------------------
// POST handler — eventos não-message
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/waha — eventos ignorados', () => {
  it('retorna ok:true e ignored:true para event != message', async () => {
    const { POST } = await import('@/app/api/webhooks/waha/route')

    const req = makeRequest({ event: 'message.ack', session: 'default', payload: {} })
    const response = await POST(req)
    const data = await response.json() as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.ignored).toBe(true)
    expect(data.event).toBe('message.ack')
  })

  it('retorna ok:true e ignored:true para event session.status', async () => {
    const { POST } = await import('@/app/api/webhooks/waha/route')

    const req = makeRequest({ event: 'session.status', payload: { status: 'WORKING' } })
    const response = await POST(req)
    const data = await response.json() as Record<string, unknown>

    expect(data.ok).toBe(true)
    expect(data.ignored).toBe(true)
  })

  it('não chama onResponseReceived para eventos ignorados', async () => {
    const { POST } = await import('@/app/api/webhooks/waha/route')

    const req = makeRequest({ event: 'message.ack' })
    await POST(req)

    expect(onResponseReceivedMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// POST handler — validação de segredo (quando WAHA_WEBHOOK_SECRET definido)
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/waha — validação de segredo', () => {
  it('retorna 401 quando segredo inválido é enviado', async () => {
    process.env.WAHA_WEBHOOK_SECRET = 'segredo-correto'

    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest(
      { event: 'message', payload: { id: 'm1', from: '5511@c.us', body: 'oi', timestamp: 1 } },
      { 'x-waha-secret': 'segredo-errado' }
    )
    const response = await POST(req)

    expect(response.status).toBe(401)

    delete process.env.WAHA_WEBHOOK_SECRET
  })

  it('aceita requisição quando segredo está correto', async () => {
    process.env.WAHA_WEBHOOK_SECRET = 'meu-segredo'

    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest(
      { event: 'message', payload: { id: 'm1', from: '5511999990000@c.us', body: 'oi', timestamp: 1710000000 } },
      { 'x-waha-secret': 'meu-segredo' }
    )
    const response = await POST(req)

    expect(response.status).toBe(200)

    delete process.env.WAHA_WEBHOOK_SECRET
  })
})

// ---------------------------------------------------------------------------
// POST handler — mensagem sem deal vinculado
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/waha — sem deal encontrado', () => {
  it('retorna matched:false e não chama onResponseReceived', async () => {
    const { POST } = await import('@/app/api/webhooks/waha/route')

    const req = makeRequest({
      event: 'message',
      session: 'default',
      payload: {
        id: 'msg-abc',
        from: '5511999990000@c.us',
        body: 'Oi!',
        timestamp: 1710000000,
      },
    })

    const response = await POST(req)
    const data = await response.json() as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.matched).toBe(false)
    expect(data.reason).toBe('no_org_match')
    expect(onResponseReceivedMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// POST handler — mensagem com deal encontrado
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/waha — deal encontrado', () => {
  beforeEach(() => {
    contactsQueryMock.mockResolvedValue({
      data: [{ id: 'contact-1', organization_id: 'org-1' }],
      error: null,
    })
    dealsQueryMock.mockResolvedValue({
      data: [{ id: 'deal-1', board_id: 'board-1' }],
      error: null,
    })
  })

  it('chama onResponseReceived com os dados corretos', async () => {
    const { POST } = await import('@/app/api/webhooks/waha/route')

    const req = makeRequest({
      event: 'message',
      payload: {
        id: 'msg-xyz',
        from: '5511999990000@c.us',
        body: 'Tenho interesse!',
        timestamp: 1710000000,
      },
    })

    const response = await POST(req)
    const data = await response.json() as Record<string, unknown>

    expect(data.matched).toBe(true)
    expect(data.dealId).toBe('deal-1')
    expect(onResponseReceivedMock).toHaveBeenCalledWith({
      dealId: 'deal-1',
      boardId: 'board-1',
      organizationId: 'org-1',
    })
  })
})

// ---------------------------------------------------------------------------
// POST handler — campo from ausente
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/waha — payload inválido', () => {
  it('retorna 422 quando from está ausente', async () => {
    const { POST } = await import('@/app/api/webhooks/waha/route')

    const req = makeRequest({
      event: 'message',
      payload: { id: 'msg-1', body: 'oi', timestamp: 1 },
    })

    const response = await POST(req)
    expect(response.status).toBe(422)
  })
})
