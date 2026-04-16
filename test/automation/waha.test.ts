/**
 * Testes unitários — lib/communication/waha.ts
 *
 * Valida envio de mensagens, conversão de chatId e
 * funções utilitárias do adapter WAHA.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const wahaConfig = {
  baseUrl: 'http://localhost:3000',
  apiKey: 'test-api-key',
  sessionName: 'default',
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// toChatId
// ---------------------------------------------------------------------------

describe('toChatId', () => {
  it('converte E.164 para chatId @c.us', async () => {
    const { toChatId } = await import('@/lib/communication/waha')
    expect(toChatId('+5511999990000')).toBe('5511999990000@c.us')
  })

  it('lida com número sem + inicial', async () => {
    const { toChatId } = await import('@/lib/communication/waha')
    expect(toChatId('+5521988880000')).toBe('5521988880000@c.us')
  })
})

// ---------------------------------------------------------------------------
// sendWahaMessage
// ---------------------------------------------------------------------------

describe('sendWahaMessage', () => {
  it('chama /api/sendText com header x-api-key e chatId correto', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'wha-msg-123', timestamp: 1710000000 }),
    })

    const { sendWahaMessage } = await import('@/lib/communication/waha')

    const result = await sendWahaMessage({
      to: '+5511999990000',
      body: 'Olá!',
      wahaConfig,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
     
    const [url, options] = (fetchMock.mock.calls as any[])[0] as [string, RequestInit]

    expect(url).toBe('http://localhost:3000/api/sendText')
    expect((options.headers as Record<string, string>)['x-api-key']).toBe('test-api-key')

    const requestBody = JSON.parse(options.body as string) as Record<string, unknown>
    expect(requestBody.chatId).toBe('5511999990000@c.us')
    expect(requestBody.text).toBe('Olá!')
    expect(requestBody.session).toBe('default')

    expect(result.id).toBe('wha-msg-123')
    expect(result.timestamp).toBe(1710000000)
  })

  it('aceita resposta com key.id (WAHA v2)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ key: { id: 'wha-v2-456' }, timestamp: 1710000001 }),
    })

    const { sendWahaMessage } = await import('@/lib/communication/waha')
    const result = await sendWahaMessage({ to: '+5511999990000', body: 'Teste', wahaConfig })
    expect(result.id).toBe('wha-v2-456')
  })

  it('lança erro quando WAHA retorna status não-ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Session not found' }),
    })

    const { sendWahaMessage } = await import('@/lib/communication/waha')

    await expect(
      sendWahaMessage({ to: '+5511999990000', body: 'Teste', wahaConfig })
    ).rejects.toThrow('Session not found')
  })

  it('lança erro genérico quando resposta não tem message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    })

    const { sendWahaMessage } = await import('@/lib/communication/waha')

    await expect(
      sendWahaMessage({ to: '+5511999990000', body: 'Teste', wahaConfig })
    ).rejects.toThrow('WAHA error: undefined')
  })
})

// ---------------------------------------------------------------------------
// sendWahaVoice
// ---------------------------------------------------------------------------

describe('sendWahaVoice', () => {
  it('inclui convert:true no payload (delega conversão p/ OGG ao WAHA)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'voice-1', timestamp: 1710000000 }),
    })

    const { sendWahaVoice } = await import('@/lib/communication/waha')
    await sendWahaVoice({
      to: '+5511999990000',
      mediaUrl: 'https://bucket.example.com/audio.webm',
      wahaConfig,
    })


    const [url, options] = (fetchMock.mock.calls as any[])[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3000/api/sendVoice')

    const body = JSON.parse(options.body as string) as Record<string, unknown>
    expect(body.session).toBe('default')
    expect(body.chatId).toBe('5511999990000@c.us')
    expect(body.convert).toBe(true)
    expect((body.file as Record<string, unknown>).url).toBe('https://bucket.example.com/audio.webm')
  })
})

// ---------------------------------------------------------------------------
// testWahaConnection
// ---------------------------------------------------------------------------

describe('testWahaConnection', () => {
  it('retorna ok:true quando sessão existe e responde 200', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'default', status: 'WORKING' }),
    })

    const { testWahaConnection } = await import('@/lib/communication/waha')
    const result = await testWahaConnection(wahaConfig)

    expect(result.ok).toBe(true)
     
    const [url, options] = (fetchMock.mock.calls as any[])[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3000/api/sessions/default')
    expect((options.headers as Record<string, string>)['x-api-key']).toBe('test-api-key')
  })

  it('retorna ok:false quando sessão retorna 404', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Session not found' }),
    })

    const { testWahaConnection } = await import('@/lib/communication/waha')
    const result = await testWahaConnection(wahaConfig)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Session not found')
  })

  it('retorna ok:false quando fetch lança exceção (servidor offline)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const { testWahaConnection } = await import('@/lib/communication/waha')
    const result = await testWahaConnection(wahaConfig)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('ECONNREFUSED')
  })
})

// ---------------------------------------------------------------------------
// getWahaSessionStatus
// ---------------------------------------------------------------------------

describe('getWahaSessionStatus', () => {
  it('retorna status WORKING quando sessão está ativa', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'default',
        status: 'WORKING',
        me: { id: '5511999990000@c.us', pushName: 'Test' },
      }),
    })

    const { getWahaSessionStatus } = await import('@/lib/communication/waha')
    const result = await getWahaSessionStatus(wahaConfig)

    expect(result.status).toBe('WORKING')
    expect(result.me?.pushName).toBe('Test')
  })

  it('retorna status STOPPED quando servidor responde não-ok', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false })

    const { getWahaSessionStatus } = await import('@/lib/communication/waha')
    const result = await getWahaSessionStatus(wahaConfig)

    expect(result.status).toBe('STOPPED')
    expect(result.name).toBe('default')
  })

  it('retorna status SCAN_QR_CODE quando aguardando pareamento', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'default', status: 'SCAN_QR_CODE' }),
    })

    const { getWahaSessionStatus } = await import('@/lib/communication/waha')
    const result = await getWahaSessionStatus(wahaConfig)

    expect(result.status).toBe('SCAN_QR_CODE')
  })
})
