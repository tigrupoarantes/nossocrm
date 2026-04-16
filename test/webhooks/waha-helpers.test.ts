/**
 * Testes puros dos helpers exportados por app/api/webhooks/waha/route.ts:
 * extractRealPhone, normalizeWahaPhone, normalizeSourceUrl, isSameHost,
 * mapWahaAckToStatus.
 *
 * Não toca em Supabase nem fetch — só lógica isolada. Por isso não precisa
 * dos mocks pesados de waha.test.ts.
 */

import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  extractRealPhone,
  normalizeWahaPhone,
  normalizeSourceUrl,
  isSameHost,
  mapWahaAckToStatus,
  validateHmacSha512,
} from '@/app/api/webhooks/waha/route'

// ---------------------------------------------------------------------------
// normalizeWahaPhone
// ---------------------------------------------------------------------------

describe('normalizeWahaPhone', () => {
  it('remove sufixo @c.us', () => {
    expect(normalizeWahaPhone('5511999990000@c.us')).toBe('5511999990000')
  })
  it('remove sufixo @s.whatsapp.net', () => {
    expect(normalizeWahaPhone('5511999990000@s.whatsapp.net')).toBe('5511999990000')
  })
  it('remove sufixo @lid (GOWS)', () => {
    expect(normalizeWahaPhone('270205083242639@lid')).toBe('270205083242639')
  })
  it('remove prefixo whatsapp: + e mantém só dígitos', () => {
    expect(normalizeWahaPhone('whatsapp:+5511 99999-0000')).toBe('5511999990000')
  })
})

// ---------------------------------------------------------------------------
// extractRealPhone (LID GOWS)
// ---------------------------------------------------------------------------

describe('extractRealPhone', () => {
  it('prefere _data.Info.SenderAlt quando disponível', () => {
    const phone = extractRealPhone({
      from: '270205083242639@lid',
      _data: { Info: { SenderAlt: '5516991370740@s.whatsapp.net' } },
    })
    expect(phone).toBe('5516991370740@s.whatsapp.net')
  })

  it('cai pra payload.from quando SenderAlt ausente', () => {
    const phone = extractRealPhone({ from: '5511999990000@c.us' })
    expect(phone).toBe('5511999990000@c.us')
  })

  it('retorna string vazia quando from e SenderAlt ausentes', () => {
    expect(extractRealPhone({})).toBe('')
  })

  it('ignora SenderAlt vazio (cai no from)', () => {
    const phone = extractRealPhone({
      from: '5511999990000@c.us',
      _data: { Info: { SenderAlt: '' } },
    })
    expect(phone).toBe('5511999990000@c.us')
  })
})

// ---------------------------------------------------------------------------
// normalizeSourceUrl
// ---------------------------------------------------------------------------

describe('normalizeSourceUrl', () => {
  it('preserva URL que já tem https://', () => {
    expect(normalizeSourceUrl('https://waha.example.com/api/files/x.jpg', null)).toBe(
      'https://waha.example.com/api/files/x.jpg',
    )
  })

  it('preserva URL que já tem http:// (não força upgrade)', () => {
    expect(normalizeSourceUrl('http://localhost:3000/api/files/x.jpg', null)).toBe(
      'http://localhost:3000/api/files/x.jpg',
    )
  })

  it('adiciona https:// quando URL vem sem scheme (caso real do WAHA)', () => {
    expect(
      normalizeSourceUrl('projetoia-wahaplus.3rglwz.easypanel.host/api/files/x.jpeg', null),
    ).toBe('https://projetoia-wahaplus.3rglwz.easypanel.host/api/files/x.jpeg')
  })

  it('resolve path relativo contra wahaBaseUrl quando começa com /', () => {
    expect(normalizeSourceUrl('/api/files/x.jpg', 'https://waha.example.com')).toBe(
      'https://waha.example.com/api/files/x.jpg',
    )
  })

  it('cai para https:// quando path relativo mas baseUrl ausente', () => {
    expect(normalizeSourceUrl('/api/files/x.jpg', null)).toBe('https://api/files/x.jpg')
  })
})

// ---------------------------------------------------------------------------
// isSameHost
// ---------------------------------------------------------------------------

describe('isSameHost', () => {
  it('true quando hosts são idênticos', () => {
    expect(
      isSameHost('https://waha.example.com/api/files/x.jpg', 'https://waha.example.com'),
    ).toBe(true)
  })

  it('true mesmo com path/scheme diferentes na base', () => {
    expect(
      isSameHost('https://waha.example.com/api/files/x.jpg', 'http://waha.example.com/'),
    ).toBe(true)
  })

  it('false quando hosts diferentes (CDN externa)', () => {
    expect(
      isSameHost('https://lookaside.fbsbx.com/file.jpg', 'https://waha.example.com'),
    ).toBe(false)
  })

  it('false quando baseUrl ausente', () => {
    expect(isSameHost('https://waha.example.com/x.jpg', null)).toBe(false)
    expect(isSameHost('https://waha.example.com/x.jpg', undefined)).toBe(false)
    expect(isSameHost('https://waha.example.com/x.jpg', '')).toBe(false)
  })

  it('false quando URL alvo é inválida', () => {
    expect(isSameHost('not-a-url', 'https://waha.example.com')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// mapWahaAckToStatus
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// validateHmacSha512
// ---------------------------------------------------------------------------

describe('validateHmacSha512', () => {
  const secret = 'my-shared-secret'
  const body = '{"event":"message","payload":{"id":"x"}}'
  const validSig = createHmac('sha512', secret).update(body).digest('hex')

  it('aceita HMAC válido com algorithm sha512', () => {
    expect(validateHmacSha512(body, validSig, 'sha512', secret)).toBe(true)
  })

  it('aceita quando algorithm omitido (header opcional)', () => {
    expect(validateHmacSha512(body, validSig, null, secret)).toBe(true)
  })

  it('rejeita assinatura inválida', () => {
    expect(validateHmacSha512(body, 'a'.repeat(128), 'sha512', secret)).toBe(false)
  })

  it('rejeita body adulterado', () => {
    expect(validateHmacSha512('{"event":"hacker"}', validSig, 'sha512', secret)).toBe(false)
  })

  it('rejeita algorithm diferente de sha512 (sha256, etc)', () => {
    expect(validateHmacSha512(body, validSig, 'sha256', secret)).toBe(false)
  })

  it('rejeita quando secret ausente', () => {
    expect(validateHmacSha512(body, validSig, 'sha512', null)).toBe(false)
    expect(validateHmacSha512(body, validSig, 'sha512', '')).toBe(false)
  })

  it('rejeita quando assinatura ausente', () => {
    expect(validateHmacSha512(body, null, 'sha512', secret)).toBe(false)
  })

  it('rejeita assinatura hex inválida (não-hexadecimal)', () => {
    expect(validateHmacSha512(body, 'zzz-not-hex', 'sha512', secret)).toBe(false)
  })

  it('rejeita assinatura com tamanho errado', () => {
    expect(validateHmacSha512(body, 'abcd1234', 'sha512', secret)).toBe(false)
  })
})

describe('mapWahaAckToStatus', () => {
  it('SERVER → sent', () => {
    expect(mapWahaAckToStatus('SERVER')).toBe('sent')
  })
  it('DEVICE → delivered', () => {
    expect(mapWahaAckToStatus('DEVICE')).toBe('delivered')
  })
  it('READ → read', () => {
    expect(mapWahaAckToStatus('READ')).toBe('read')
  })
  it('PLAYED → read (convergido com READ)', () => {
    expect(mapWahaAckToStatus('PLAYED')).toBe('read')
  })
  it('ERROR → failed', () => {
    expect(mapWahaAckToStatus('ERROR')).toBe('failed')
  })
  it('aceita case-insensitive', () => {
    expect(mapWahaAckToStatus('read')).toBe('read')
    expect(mapWahaAckToStatus('Device')).toBe('delivered')
  })
  it('retorna null para ackName desconhecido ou undefined', () => {
    expect(mapWahaAckToStatus(undefined)).toBeNull()
    expect(mapWahaAckToStatus('')).toBeNull()
    expect(mapWahaAckToStatus('PENDING')).toBeNull()
    expect(mapWahaAckToStatus('FOO')).toBeNull()
  })
})
