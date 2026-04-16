/**
 * Testes — app/api/webhooks/waha/route.ts (handler POST)
 *
 * Cobre eventos message + message.ack, validação de segredo e resolução
 * multi-tenant via sessionName. Para os helpers puros (extractRealPhone,
 * normalizeSourceUrl, isSameHost, mapWahaAckToStatus, normalizeWahaPhone)
 * veja `test/webhooks/waha-helpers.test.ts`.
 */

import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks de Supabase — usamos uma "tabela em memória" para messages para
// simular SELECT por wa_message_id e UPDATE por id no fluxo de message.ack.
// ---------------------------------------------------------------------------

interface FakeMessageRow {
  id: string
  organization_id: string
  wa_message_id: string
  status: string
}

const messagesStore: FakeMessageRow[] = []

const upsertConvMock = vi.fn(async () => ({ data: { id: 'conv-1', unread_count: 0 }, error: null }))
const upsertMsgMock = vi.fn(async () => ({ data: null, error: null }))
const updateMsgMock = vi.fn(async () => ({ error: null }))
const updateConvMock = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
const writeLogMock = vi.fn(async () => ({ error: null }))

const contactsQueryMock = vi.fn(async () => ({ data: null, error: null }))
const dealsQueryMock = vi.fn(async () => ({ data: [], error: null }))
const findExistingConvMock = vi.fn(async () => ({ data: null, error: null }))

function buildMessagesQueryBuilder() {
  // Cadeia: .from('messages').select(...).eq(...).eq(...).maybeSingle()
  let filterOrgId = ''
  let filterWaId = ''
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn(function(this: unknown, col: string, value: string) {
      if (col === 'organization_id') filterOrgId = value
      if (col === 'wa_message_id') filterWaId = value
      return this
    }),
    maybeSingle: vi.fn(async () => {
      const found = messagesStore.find(
        (m) => m.organization_id === filterOrgId && m.wa_message_id === filterWaId,
      )
      return { data: found ?? null, error: null }
    }),
    update: vi.fn((patch: { status: string }) => ({
      eq: vi.fn(async (_col: string, id: string) => {
        const row = messagesStore.find((m) => m.id === id)
        if (row) row.status = patch.status
        updateMsgMock(patch)
        return { error: null }
      }),
    })),
    upsert: upsertMsgMock,
  }
}

const supabaseMock = {
  from: vi.fn((table: string) => {
    if (table === 'contacts') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: contactsQueryMock,
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
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: findExistingConvMock,
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({ single: upsertConvMock })),
        })),
        update: updateConvMock,
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: 'conv-1' }, error: null })),
          })),
        })),
      }
    }
    if (table === 'messages') return buildMessagesQueryBuilder()
    if (table === 'webhook_logs') return { insert: writeLogMock }
    return {}
  }),
}

vi.mock('@/lib/supabase/server', () => ({
  createStaticAdminClient: vi.fn(() => supabaseMock),
  createClient: vi.fn(() => supabaseMock),
}))

// Resolver de config WAHA por sessionName — controlado por teste
const resolveWahaConfigBySessionMock = vi.fn(async () => null as unknown)
vi.mock('@/lib/communication/meta-config-resolver', () => ({
  resolveWahaConfigBySession: resolveWahaConfigBySessionMock,
}))

// Triggers de automação e Super Agent — não executar de verdade
const onResponseReceivedMock = vi.fn(async () => undefined)
vi.mock('@/lib/automation/triggers', () => ({
  onResponseReceived: onResponseReceivedMock,
}))
const processWithSuperAgentMock = vi.fn(async () => undefined)
vi.mock('@/lib/ai/super-agent/engine', () => ({
  processWithSuperAgent: processWithSuperAgentMock,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/webhooks/waha', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.WAHA_WEBHOOK_SECRET
  delete process.env.WAHA_HMAC_SECRET
  messagesStore.length = 0
  resolveWahaConfigBySessionMock.mockResolvedValue(null)
  contactsQueryMock.mockResolvedValue({ data: null, error: null })
  dealsQueryMock.mockResolvedValue({ data: [], error: null })
  findExistingConvMock.mockResolvedValue({ data: null, error: null })
})

// ---------------------------------------------------------------------------
// Validação de segredo
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/waha — autenticação', () => {
  it('retorna 401 quando x-waha-secret invalido é enviado', async () => {
    process.env.WAHA_WEBHOOK_SECRET = 'segredo-correto'
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest(
      { event: 'message', payload: { id: 'm1', from: '5511@c.us', body: 'oi', timestamp: 1 } },
      { 'x-waha-secret': 'segredo-errado' },
    )
    const response = await POST(req)
    expect(response.status).toBe(401)
  })

  it('aceita requisicao quando x-waha-secret está correto', async () => {
    process.env.WAHA_WEBHOOK_SECRET = 'meu-segredo'
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest(
      { event: 'session.status', payload: {} },
      { 'x-waha-secret': 'meu-segredo' },
    )
    const response = await POST(req)
    expect(response.status).toBe(200)
  })

  it('aceita HMAC SHA-512 válido quando WAHA_HMAC_SECRET configurado', async () => {
    process.env.WAHA_HMAC_SECRET = 'hmac-key'
    const body = JSON.stringify({ event: 'session.status', payload: {} })
    const sig = createHmac('sha512', 'hmac-key').update(body).digest('hex')
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = new Request('http://localhost/api/webhooks/waha', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': sig,
        'x-webhook-hmac-algorithm': 'sha512',
      },
      body,
    })
    const response = await POST(req)
    expect(response.status).toBe(200)
  })

  it('rejeita HMAC inválido com 401 quando WAHA_HMAC_SECRET configurado', async () => {
    process.env.WAHA_HMAC_SECRET = 'hmac-key'
    const body = JSON.stringify({ event: 'session.status', payload: {} })
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = new Request('http://localhost/api/webhooks/waha', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': 'a'.repeat(128),
        'x-webhook-hmac-algorithm': 'sha512',
      },
      body,
    })
    const response = await POST(req)
    expect(response.status).toBe(401)
  })

  it('cai para x-waha-secret quando HMAC secret existe mas header HMAC ausente', async () => {
    process.env.WAHA_HMAC_SECRET = 'hmac-key'
    process.env.WAHA_WEBHOOK_SECRET = 'fallback-secret'
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest(
      { event: 'session.status', payload: {} },
      { 'x-waha-secret': 'fallback-secret' },
    )
    const response = await POST(req)
    expect(response.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Eventos ignorados (não-message, não-message.ack)
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/waha — eventos ignorados', () => {
  it('responde 200 ignored para session.status', async () => {
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest({ event: 'session.status', payload: { status: 'WORKING' } })
    const response = await POST(req)
    const data = (await response.json()) as Record<string, unknown>
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.ignored).toBe(true)
  })

  it('não chama onResponseReceived nem Super Agent', async () => {
    const { POST } = await import('@/app/api/webhooks/waha/route')
    await POST(makeRequest({ event: 'group.v2.update', payload: {} }))
    expect(onResponseReceivedMock).not.toHaveBeenCalled()
    expect(processWithSuperAgentMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// event = message
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/waha — message', () => {
  it('dropa quando session não bate com nenhuma org', async () => {
    resolveWahaConfigBySessionMock.mockResolvedValue(null)
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest({
      event: 'message',
      session: 'sessao-fantasma',
      payload: { id: 'm1', from: '5511999@c.us', body: 'oi', timestamp: 1 },
    })
    const response = await POST(req)
    const data = (await response.json()) as Record<string, unknown>
    expect(response.status).toBe(200)
    expect(data.dropped).toBe(true)
    expect(data.reason).toBe('no_org_for_session')
    expect(onResponseReceivedMock).not.toHaveBeenCalled()
  })

  it('persiste e dispara onResponseReceived quando há contato e deal', async () => {
    resolveWahaConfigBySessionMock.mockResolvedValue({
      organizationId: 'org-1',
      sessionName: 'Whats_CRM',
      baseUrl: 'https://waha.example.com',
      apiKey: 'k',
      source: 'organization_settings',
    })
    contactsQueryMock.mockResolvedValue({ data: { id: 'contact-1' }, error: null })
    dealsQueryMock.mockResolvedValue({
      data: [{ id: 'deal-1', board_id: 'board-1', boards: { template: 'QUALIFICATION' } }],
      error: null,
    })

    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest({
      event: 'message',
      session: 'Whats_CRM',
      payload: { id: 'msg-xyz', from: '5511999990000@c.us', body: 'Tenho interesse', timestamp: 1710000000 },
    })
    const response = await POST(req)
    const data = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.conversationId).toBe('conv-1')
    expect(data.dealMatched).toBe(true)
    expect(onResponseReceivedMock).toHaveBeenCalledWith({
      dealId: 'deal-1',
      boardId: 'board-1',
      organizationId: 'org-1',
    })
  })

  it('ignora payload com fromMe=true (eco do próprio outbound)', async () => {
    resolveWahaConfigBySessionMock.mockResolvedValue({
      organizationId: 'org-1',
      sessionName: 'Whats_CRM',
      source: 'organization_settings',
    })
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest({
      event: 'message',
      session: 'Whats_CRM',
      payload: { fromMe: true, id: 'm1', from: '5511@c.us', body: '', timestamp: 1 },
    })
    const response = await POST(req)
    const data = (await response.json()) as Record<string, unknown>
    expect(data.ignored).toBe(true)
    expect(data.reason).toBe('from_me')
  })

  it('retorna 422 quando from está ausente', async () => {
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest({
      event: 'message',
      session: 'Whats_CRM',
      payload: { id: 'm1', body: 'oi', timestamp: 1 },
    })
    const response = await POST(req)
    expect(response.status).toBe(422)
  })

  it('processa event=message.any igual a message (WAHA GOWS 2026.4.x)', async () => {
    resolveWahaConfigBySessionMock.mockResolvedValue({
      organizationId: 'org-1',
      sessionName: 'Whats_CRM',
      source: 'organization_settings',
    })
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest({
      event: 'message.any',
      session: 'Whats_CRM',
      payload: {
        id: 'msg-any-1',
        from: '270205083242639@lid',
        body: 'Teste GOWS',
        timestamp: 1776358594,
        fromMe: false,
        _data: { Info: { SenderAlt: '5516991370740@s.whatsapp.net' } },
      },
    })
    const response = await POST(req)
    const data = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    // NÃO deve ser ignored — message.any é processado
    expect(data.ignored).toBeUndefined()
    expect(data.conversationId).toBe('conv-1')
  })

  it('continua ignorando message.any quando fromMe=true (eco do outbound)', async () => {
    resolveWahaConfigBySessionMock.mockResolvedValue({
      organizationId: 'org-1',
      sessionName: 'Whats_CRM',
      source: 'organization_settings',
    })
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest({
      event: 'message.any',
      session: 'Whats_CRM',
      payload: { fromMe: true, id: 'm1', from: '5511@c.us', body: '', timestamp: 1 },
    })
    const response = await POST(req)
    const data = (await response.json()) as Record<string, unknown>
    expect(data.ignored).toBe(true)
    expect(data.reason).toBe('from_me')
  })
})

// ---------------------------------------------------------------------------
// event = message.ack — atualiza messages.status
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/waha — message.ack', () => {
  beforeEach(() => {
    resolveWahaConfigBySessionMock.mockResolvedValue({
      organizationId: 'org-1',
      sessionName: 'Whats_CRM',
      source: 'organization_settings',
    })
  })

  it('atualiza sent → delivered quando ack=DEVICE', async () => {
    messagesStore.push({ id: 'msg-row-1', organization_id: 'org-1', wa_message_id: 'wamid-1', status: 'sent' })
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest({
      event: 'message.ack',
      session: 'Whats_CRM',
      payload: { id: 'wamid-1', ackName: 'DEVICE', ack: 2 },
    })
    const response = await POST(req)
    const data = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(data.status).toBe('delivered')
    expect(messagesStore[0].status).toBe('delivered')
  })

  it('atualiza delivered → read quando ack=READ', async () => {
    messagesStore.push({ id: 'msg-row-2', organization_id: 'org-1', wa_message_id: 'wamid-2', status: 'delivered' })
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest({
      event: 'message.ack',
      session: 'Whats_CRM',
      payload: { id: 'wamid-2', ackName: 'READ', ack: 3 },
    })
    await POST(req)
    expect(messagesStore[0].status).toBe('read')
  })

  it('PLAYED também vira read (convergido)', async () => {
    messagesStore.push({ id: 'msg-row-3', organization_id: 'org-1', wa_message_id: 'wamid-3', status: 'delivered' })
    const { POST } = await import('@/app/api/webhooks/waha/route')
    await POST(
      makeRequest({
        event: 'message.ack',
        session: 'Whats_CRM',
        payload: { id: 'wamid-3', ackName: 'PLAYED', ack: 4 },
      }),
    )
    expect(messagesStore[0].status).toBe('read')
  })

  it('ignora downgrade (ex: read → delivered)', async () => {
    messagesStore.push({ id: 'msg-row-4', organization_id: 'org-1', wa_message_id: 'wamid-4', status: 'read' })
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const req = makeRequest({
      event: 'message.ack',
      session: 'Whats_CRM',
      payload: { id: 'wamid-4', ackName: 'DEVICE', ack: 2 },
    })
    const response = await POST(req)
    const data = (await response.json()) as Record<string, unknown>
    expect(data.ignored).toBe(true)
    expect(data.reason).toBe('no_upgrade')
    expect(messagesStore[0].status).toBe('read')
  })

  it('failed sempre prevalece (ack=ERROR)', async () => {
    messagesStore.push({ id: 'msg-row-5', organization_id: 'org-1', wa_message_id: 'wamid-5', status: 'read' })
    const { POST } = await import('@/app/api/webhooks/waha/route')
    await POST(
      makeRequest({
        event: 'message.ack',
        session: 'Whats_CRM',
        payload: { id: 'wamid-5', ackName: 'ERROR', ack: -1 },
      }),
    )
    expect(messagesStore[0].status).toBe('failed')
  })

  it('retorna dropped quando ack chega para mensagem desconhecida', async () => {
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const response = await POST(
      makeRequest({
        event: 'message.ack',
        session: 'Whats_CRM',
        payload: { id: 'inexistente', ackName: 'READ', ack: 3 },
      }),
    )
    const data = (await response.json()) as Record<string, unknown>
    expect(data.dropped).toBe(true)
    expect(data.reason).toBe('message_not_found')
  })

  it('ignora ack sem ackName ou id', async () => {
    const { POST } = await import('@/app/api/webhooks/waha/route')
    const response = await POST(
      makeRequest({
        event: 'message.ack',
        session: 'Whats_CRM',
        payload: { id: 'wamid-1' /* sem ackName */ },
      }),
    )
    const data = (await response.json()) as Record<string, unknown>
    expect(data.ignored).toBe(true)
    expect(data.reason).toBe('invalid_ack')
  })

  it('não dispara Super Agent nem onResponseReceived no caminho do ack', async () => {
    messagesStore.push({ id: 'msg-row-6', organization_id: 'org-1', wa_message_id: 'wamid-6', status: 'sent' })
    const { POST } = await import('@/app/api/webhooks/waha/route')
    await POST(
      makeRequest({
        event: 'message.ack',
        session: 'Whats_CRM',
        payload: { id: 'wamid-6', ackName: 'DEVICE', ack: 2 },
      }),
    )
    expect(onResponseReceivedMock).not.toHaveBeenCalled()
    expect(processWithSuperAgentMock).not.toHaveBeenCalled()
  })
})
