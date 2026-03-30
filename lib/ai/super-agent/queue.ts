/**
 * lib/ai/super-agent/queue.ts
 * Fila simples de processamento do Super Agente.
 * Evita processamento paralelo da mesma conversa (debounce por conversation_id).
 */

const processingSet = new Set<string>()

/**
 * Retorna true se a conversa já está sendo processada.
 * Adiciona à fila se não estiver.
 */
export function tryAcquire(conversationId: string): boolean {
  if (processingSet.has(conversationId)) return false
  processingSet.add(conversationId)
  return true
}

/**
 * Libera a conversa da fila de processamento.
 */
export function release(conversationId: string): void {
  processingSet.delete(conversationId)
}

/**
 * Wrapper que garante execução exclusiva por conversa.
 * Descarta mensagens se já estiver processando.
 */
export async function withExclusive<T>(
  conversationId: string,
  fn: () => Promise<T>
): Promise<T | null> {
  if (!tryAcquire(conversationId)) {
    console.log(`[SuperAgentQueue] Skipping — already processing conversation ${conversationId}`)
    return null
  }
  try {
    return await fn()
  } finally {
    release(conversationId)
  }
}

/**
 * Verifica se um agente está dentro do horário de funcionamento.
 */
export function isWithinSchedule(
  config: Record<string, unknown>
): boolean {
  const schedule = config?.schedule as Record<string, unknown> | undefined
  if (!schedule?.enabled) return true // sem horário = sempre ativo

  const now = new Date()
  const days = schedule.days as number[] | undefined // 0=Dom, 1=Seg, ..., 6=Sáb
  const startHour = (schedule.start_hour as number) ?? 8
  const endHour = (schedule.end_hour as number) ?? 18
  const currentDay = now.getDay()
  const currentHour = now.getHours()

  if (days && !days.includes(currentDay)) return false
  if (currentHour < startHour || currentHour >= endHour) return false

  return true
}
