/**
 * lib/ai/super-agent/handoff.ts
 * Lógica de transferência do Super Agente para humano.
 * Detecta palavras-chave, sentimento negativo e pedidos explícitos.
 */

export interface HandoffDecision {
  shouldHandoff: boolean
  reason: 'keyword' | 'explicit_request' | 'negative_sentiment' | 'limit_reached' | null
  triggerText: string | null
}

/** Palavras/frases que indicam pedido de humano */
const EXPLICIT_HANDOFF_PHRASES = [
  'falar com humano',
  'falar com pessoa',
  'falar com atendente',
  'quero atendente',
  'atendente humano',
  'pessoa real',
  'não quero bot',
  'não quero robô',
  'sair do bot',
  'cancela',
  'falar com alguém',
  'responsável',
  'gerente',
  'supervisor',
]

/** Palavras que indicam sentimento negativo/urgência */
const NEGATIVE_SENTIMENT_PHRASES = [
  'processo',
  'advogado',
  'procon',
  'reclame aqui',
  'justiça',
  'urgente',
  'emergência',
  'muito irritado',
  'indignado',
  'absurdo',
  'decepcionado',
  'nunca mais',
]

/**
 * Analisa a mensagem do usuário para decidir se deve transferir para humano.
 */
export function checkHandoff(
  message: string,
  options?: {
    customKeywords?: string[]
    messageCount?: number
    maxMessagesPerSession?: number
  }
): HandoffDecision {
  const lower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // 1. Verificar limite de mensagens por sessão
  if (
    options?.messageCount !== undefined &&
    options?.maxMessagesPerSession !== undefined &&
    options.messageCount >= options.maxMessagesPerSession
  ) {
    return { shouldHandoff: true, reason: 'limit_reached', triggerText: null }
  }

  // 2. Palavras-chave customizadas do agente
  if (options?.customKeywords) {
    for (const kw of options.customKeywords) {
      const normalized = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (lower.includes(normalized)) {
        return { shouldHandoff: true, reason: 'keyword', triggerText: kw }
      }
    }
  }

  // 3. Pedido explícito de humano
  for (const phrase of EXPLICIT_HANDOFF_PHRASES) {
    if (lower.includes(phrase)) {
      return { shouldHandoff: true, reason: 'explicit_request', triggerText: phrase }
    }
  }

  // 4. Sentimento negativo
  for (const phrase of NEGATIVE_SENTIMENT_PHRASES) {
    if (lower.includes(phrase)) {
      return { shouldHandoff: true, reason: 'negative_sentiment', triggerText: phrase }
    }
  }

  return { shouldHandoff: false, reason: null, triggerText: null }
}

/**
 * Gera a mensagem de transferência para o usuário.
 */
export function buildHandoffMessage(
  agentName: string,
  reason: HandoffDecision['reason'],
  fallbackMessage?: string
): string {
  if (fallbackMessage) return fallbackMessage

  const base = `Oi! Vou transferir você para um membro da nossa equipe que poderá te ajudar melhor. 😊`

  switch (reason) {
    case 'explicit_request':
      return `Claro! ${base} Aguarde um momento.`
    case 'negative_sentiment':
      return `Entendo sua situação. ${base} Eles entrarão em contato em breve.`
    case 'limit_reached':
      return `${base} Nossa equipe continuará o atendimento em instantes!`
    default:
      return `${base} Até logo!`
  }
}

/**
 * Extrai palavras-chave de handoff do config do agente.
 */
export function extractHandoffKeywords(config: Record<string, unknown>): string[] {
  const fallback = config?.fallback as Record<string, unknown> | undefined
  const keywords = fallback?.handoff_keywords
  if (Array.isArray(keywords)) return keywords.filter((k): k is string => typeof k === 'string')
  return []
}
