/**
 * lib/ai/super-agent/engine.ts
 * Motor principal do Super Agente IA.
 *
 * Fluxo:
 *   1. Verificar se há agente ativo para a organização/departamento
 *   2. Verificar horário de funcionamento
 *   3. Verificar créditos disponíveis
 *   4. Checar se deve transferir para humano (handoff)
 *   5. Construir contexto do contato
 *   6. Gerar resposta com AI SDK
 *   7. Enviar mensagem via WAHA/message-router
 *   8. Registrar log e debitar créditos
 */
import { generateText } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildContactContext, formatContextForPrompt } from './context-builder'
import { checkHandoff, buildHandoffMessage, extractHandoffKeywords } from './handoff'
import { withExclusive, isWithinSchedule } from './queue'
import { deductCredits, AI_CREDIT_COSTS } from '@/lib/ai/credits'

export interface SuperAgentInput {
  organizationId: string
  conversationId: string
  contactPhone: string
  inboundMessage: string
  /** Se informado, usa agente específico; caso contrário, busca o ativo */
  agentId?: string
}

export interface SuperAgentResult {
  status: 'success' | 'handoff' | 'skipped' | 'error' | 'no_agent'
  agentId?: string
  response?: string
  reason?: string
}

/**
 * Processa uma mensagem inbound e retorna a resposta do agente.
 * Toda a lógica de exclusão por conversa é gerida pelo queue.
 */
export async function processWithSuperAgent(
  sb: SupabaseClient,
  input: SuperAgentInput
): Promise<SuperAgentResult | null> {
  return withExclusive(input.conversationId, async () => {
    const startMs = Date.now()

    // 0. Gate: respeitar handoff humano. Se um humano já assumiu a conversa
    //    (ai_agent_owned=false) ou ela está encerrada, o Super Agente não responde.
    const { data: convRow } = await sb
      .from('conversations')
      .select('ai_agent_owned, status')
      .eq('id', input.conversationId)
      .single()

    if (convRow && convRow.ai_agent_owned === false) {
      return { status: 'skipped', reason: 'Conversa atribuída a humano' }
    }
    if (convRow && convRow.status === 'encerrado') {
      return { status: 'skipped', reason: 'Conversa encerrada' }
    }

    // 1. Buscar agente ativo
    const agentQuery = sb
      .from('super_agents')
      .select('id, name, system_prompt, model, provider, temperature, max_tokens, config, department_id, organization_id')
      .eq('organization_id', input.organizationId)
      .eq('is_active', true)

    if (input.agentId) {
      agentQuery.eq('id', input.agentId)
    }

    const { data: agents } = await agentQuery.limit(1)
    const agent = agents?.[0]

    if (!agent) {
      return { status: 'no_agent', reason: 'Nenhum Super Agente ativo encontrado' }
    }

    // 2. Verificar horário
    if (!isWithinSchedule(agent.config as Record<string, unknown>)) {
      return { status: 'skipped', agentId: agent.id, reason: 'Fora do horário de funcionamento' }
    }

    // 3. Verificar créditos
    const creditCost = AI_CREDIT_COSTS.super_agent_message
    const hasCredits = await deductCredits(
      input.organizationId,
      creditCost,
      `Super Agente: ${agent.name}`,
      'super_agent',
      agent.id
    )

    if (!hasCredits) {
      await logResult(sb, { agent, input, status: 'error', creditsUsed: 0, responseTimeMs: Date.now() - startMs,
        metadata: { error: 'Saldo de créditos insuficiente' } })
      return { status: 'error', agentId: agent.id, reason: 'Saldo de créditos insuficiente' }
    }

    // 4. Checar handoff antes de processar
    const config = agent.config as Record<string, unknown>
    const customKeywords = extractHandoffKeywords(config)
    const limits = config?.limits as Record<string, unknown> | undefined

    // Contar mensagens da sessão
    const { count: sessionCount } = await sb
      .from('super_agent_logs')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agent.id)
      .eq('conversation_id', input.conversationId)
      .eq('status', 'success')

    const handoffCheck = checkHandoff(input.inboundMessage, {
      customKeywords,
      messageCount: sessionCount ?? 0,
      maxMessagesPerSession: (limits?.max_messages_per_session as number) ?? 50,
    })

    if (handoffCheck.shouldHandoff) {
      const fallbackMsg = (config?.fallback as Record<string, unknown>)?.message as string | undefined
      const handoffMsg = buildHandoffMessage(agent.name, handoffCheck.reason, fallbackMsg)

      await sendReply(sb, input.conversationId, input.organizationId, handoffMsg)
      await logResult(sb, {
        agent, input, status: 'handoff', creditsUsed: creditCost,
        outputMessage: handoffMsg, responseTimeMs: Date.now() - startMs,
        metadata: { handoff_reason: handoffCheck.reason, trigger: handoffCheck.triggerText }
      })

      // Marcar conversa como aguardando humano: desliga agente, mantém em_espera
      await sb
        .from('conversations')
        .update({
          ai_agent_owned: false,
          assigned_user_id: null,
          status: 'em_espera',
        })
        .eq('id', input.conversationId)

      return { status: 'handoff', agentId: agent.id, response: handoffMsg }
    }

    // 5. Construir contexto do contato
    const ctx = await buildContactContext(sb, input.contactPhone, input.conversationId, input.organizationId)
    const contextStr = formatContextForPrompt(ctx)

    // 6. Buscar API key da org
    const { data: orgSettings } = await sb
      .from('organization_settings')
      .select('google_api_key, openai_api_key')
      .eq('organization_id', input.organizationId)
      .single()

    const apiKey = orgSettings?.google_api_key || process.env.GOOGLE_AI_API_KEY || ''
    if (!apiKey) {
      return { status: 'error', agentId: agent.id, reason: 'API key não configurada' }
    }

    // 7. Gerar resposta
    const google = createGoogleGenerativeAI({ apiKey })
    const model = google(agent.model || 'gemini-3-flash-preview')

    const systemPrompt = [
      agent.system_prompt,
      contextStr ? `\n\n${contextStr}` : '',
      '\n\nIMPORTANTE: Responda SEMPRE em português brasileiro. Seja conciso (máximo 3 parágrafos). Não use markdown.',
    ].join('')

    let generatedText = ''
    let tokensUsed = 0

    try {
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt: input.inboundMessage,
        temperature: Number(agent.temperature) || 0.7,
      })
      generatedText = result.text
      tokensUsed = result.usage?.totalTokens ?? 0
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      await logResult(sb, { agent, input, status: 'error', creditsUsed: creditCost, responseTimeMs: Date.now() - startMs,
        metadata: { error: errMsg } })
      return { status: 'error', agentId: agent.id, reason: errMsg }
    }

    // 8. Enviar resposta
    await sendReply(sb, input.conversationId, input.organizationId, generatedText)

    // 9. Log de sucesso
    await logResult(sb, {
      agent, input, status: 'success', creditsUsed: creditCost, tokensUsed,
      outputMessage: generatedText, responseTimeMs: Date.now() - startMs, metadata: {}
    })

    return { status: 'success', agentId: agent.id, response: generatedText }
  }) ?? { status: 'skipped', reason: 'Conversa já sendo processada' }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

async function sendReply(
  sb: SupabaseClient,
  conversationId: string,
  organizationId: string,
  body: string
): Promise<void> {
  // Persistir mensagem outbound
  await sb.from('messages').insert({
    conversation_id: conversationId,
    direction: 'outbound',
    body,
    source: 'super_agent',
  })

  // Atualizar last_message_at da conversa
  await sb.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId)

  // Enviar via message-router
  try {
    const { routeAndSendMessage } = await import('@/lib/communication/message-router')
    await routeAndSendMessage(sb, { conversationId, body })
  } catch (e) {
    console.error('[SuperAgent] sendReply error:', e)
  }
}

async function logResult(
  sb: SupabaseClient,
  params: {
    agent: { id: string; organization_id: string }
    input: SuperAgentInput
    status: 'success' | 'error' | 'fallback' | 'handoff' | 'skipped'
    creditsUsed: number
    tokensUsed?: number
    outputMessage?: string
    responseTimeMs: number
    metadata: Record<string, unknown>
  }
): Promise<void> {
  await sb.from('super_agent_logs').insert({
    agent_id: params.agent.id,
    organization_id: params.agent.organization_id,
    conversation_id: params.input.conversationId,
    input_message: params.input.inboundMessage,
    output_message: params.outputMessage ?? null,
    tokens_used: params.tokensUsed ?? null,
    credits_used: params.creditsUsed,
    response_time_ms: params.responseTimeMs,
    status: params.status,
    metadata: params.metadata,
  })
}
