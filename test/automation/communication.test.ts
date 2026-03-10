/**
 * Testes unitários — lib/communication/email.ts + whatsapp.ts
 *
 * Simula nodemailer e fetch sem credenciais reais.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock nodemailer
// ---------------------------------------------------------------------------

const sendMailMock = vi.fn(async () => ({ messageId: 'msg-abc123' }))
const verifyMock = vi.fn(async () => true)
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock, verify: verifyMock }))

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
  createTransport: createTransportMock,
}))

// ---------------------------------------------------------------------------
// Mock global fetch (Twilio REST)
// ---------------------------------------------------------------------------

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// ---------------------------------------------------------------------------

const smtpConfig = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'u',
  pass: 'p',
  fromName: 'NossoCRM',
  fromEmail: 'crm@example.com',
}

const twilioConfig = {
  accountSid: 'ACtest123',
  authToken: 'token456',
  fromNumber: '+14155238886',
}

beforeEach(() => {
  vi.clearAllMocks()
  verifyMock.mockReset()
  verifyMock.mockResolvedValue(true)
  sendMailMock.mockReset()
  sendMailMock.mockResolvedValue({ messageId: 'msg-abc123' })
  createTransportMock.mockImplementation(() => ({ sendMail: sendMailMock, verify: verifyMock }))
})

// ---------------------------------------------------------------------------
// sendEmail
// ---------------------------------------------------------------------------

describe('sendEmail', () => {
  it('cria transport com as configurações SMTP e chama sendMail', async () => {
    const { sendEmail } = await import('@/lib/communication/email')

    await sendEmail({
      smtpConfig,
      to: 'joao@example.com',
      subject: 'Olá da NossoCRM',
      html: '<p>Mensagem de teste</p>',
    })

    expect(createTransportMock).toHaveBeenCalledOnce()
    expect(sendMailMock).toHaveBeenCalledOnce()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mailOptions = (sendMailMock.mock.calls as any[])[0][0] as Record<string, unknown>
    expect(mailOptions.to).toBe('joao@example.com')
    expect(mailOptions.subject).toBe('Olá da NossoCRM')
  })

  it('retorna messageId do nodemailer', async () => {
    const { sendEmail } = await import('@/lib/communication/email')
    const result = await sendEmail({ smtpConfig, to: 'dest@example.com', subject: 'Teste', html: '<p>ok</p>' })
    expect(result.messageId).toBe('msg-abc123')
  })

  it('lança erro quando nodemailer falha', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('Connection refused'))
    const { sendEmail } = await import('@/lib/communication/email')

    await expect(
      sendEmail({ smtpConfig, to: 'a@b.com', subject: 'Fail', html: '<p>fail</p>' })
    ).rejects.toThrow('Connection refused')
  })
})

// ---------------------------------------------------------------------------
// testSmtpConnection
// ---------------------------------------------------------------------------

describe('testSmtpConnection', () => {
  it('retorna ok:true quando o transport verifica com sucesso', async () => {
    const { testSmtpConnection } = await import('@/lib/communication/email')
    const result = await testSmtpConnection(smtpConfig)
    expect(result.ok).toBe(true)
  })

  it('retorna ok:false com mensagem quando verify lança exceção', async () => {
    createTransportMock.mockReturnValueOnce({
      sendMail: sendMailMock,
      verify: vi.fn(async () => { throw new Error('Auth failed') }),
    })

    const { testSmtpConnection } = await import('@/lib/communication/email')
    const result = await testSmtpConnection(smtpConfig)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Auth failed')
  })
})

// ---------------------------------------------------------------------------
// sendWhatsApp
// ---------------------------------------------------------------------------

describe('sendWhatsApp', () => {
  it('chama a API do Twilio com os parâmetros corretos e retorna sid', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sid: 'SM123', status: 'queued' }),
    })

    const { sendWhatsApp } = await import('@/lib/communication/whatsapp')

    const result = await sendWhatsApp({
      twilioConfig,
      to: '+5511999990001',
      body: 'Olá! Somos da NossoCRM.',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [url, options] = (fetchMock.mock.calls as any[])[0] as [string, RequestInit]
    expect(url).toContain('ACtest123')
    expect(url).toContain('Messages.json')
    expect(options.method).toBe('POST')
    expect(result.sid).toBe('SM123')
  })

  it('lança erro quando Twilio retorna status não-ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Invalid credentials' }),
    })

    const { sendWhatsApp } = await import('@/lib/communication/whatsapp')

    await expect(
      sendWhatsApp({ twilioConfig, to: '+5511999990001', body: 'Teste' })
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// testTwilioCredentials
// ---------------------------------------------------------------------------

describe('testTwilioCredentials', () => {
  it('retorna ok:true quando Twilio responde com sucesso', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ account_sid: 'ACtest123', status: 'active' }),
    })

    const { testTwilioCredentials } = await import('@/lib/communication/whatsapp')
    const result = await testTwilioCredentials(twilioConfig)
    expect(result.ok).toBe(true)
  })

  it('retorna ok:false quando Twilio retorna erro', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Unauthorized' }),
    })

    const { testTwilioCredentials } = await import('@/lib/communication/whatsapp')
    const result = await testTwilioCredentials(twilioConfig)
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })
})
