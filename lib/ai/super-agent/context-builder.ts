/**
 * lib/ai/super-agent/context-builder.ts
 * Monta contexto rico para o Super Agente: histórico, deals e atividades do contato.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ContactContext {
  contact: {
    id: string
    name: string
    phone: string | null
    email: string | null
    company: string | null
    lifecycleStage: string | null
    tags: string[]
  } | null
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>
  activeDeals: Array<{ title: string; value: number | null; stage: string; board: string }>
  recentActivities: Array<{ type: string; title: string; completed: boolean; dueDate: string | null }>
}

/**
 * Monta o contexto completo do contato para o agente.
 * @param sb - Supabase admin client
 * @param phone - Telefone do contato (formato E.164 ou raw)
 * @param conversationId - ID da conversa atual
 * @param organizationId - ID da organização
 */
export async function buildContactContext(
  sb: SupabaseClient,
  phone: string,
  conversationId: string,
  organizationId: string
): Promise<ContactContext> {
  // Normalizar telefone para busca
  const digits = phone.replace(/\D/g, '')

  // Buscar contato por telefone
  const { data: contactData } = await sb
    .from('contacts')
    .select('id, first_name, last_name, email, phone, lifecycle_stage, tags, client_company_id')
    .eq('organization_id', organizationId)
    .or(`phone.ilike.%${digits}%,phone.eq.+${digits}`)
    .limit(1)
    .single()

  let companyName: string | null = null
  if (contactData?.client_company_id) {
    const { data: company } = await sb
      .from('crm_companies')
      .select('name')
      .eq('id', contactData.client_company_id)
      .single()
    companyName = company?.name ?? null
  }

  // Buscar mensagens recentes da conversa (últimas 15)
  const { data: messages } = await sb
    .from('messages')
    .select('direction, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(15)

  const recentMessages = (messages ?? [])
    .reverse()
    .map((m) => ({
      role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.body ?? '',
      timestamp: m.created_at,
    }))

  // Deals ativos do contato (se existir)
  const activeDeals: ContactContext['activeDeals'] = []
  let recentActivities: ContactContext['recentActivities'] = []
  if (contactData?.id) {
    const { data: deals } = await sb
      .from('deals')
      .select('title, value, stage_id, board_id, boards(name), board_stages(name)')
      .eq('organization_id', organizationId)
      .eq('contact_id', contactData.id)
      .is('closed_at', null)
      .limit(3)

    for (const deal of deals ?? []) {
      activeDeals.push({
        title: deal.title ?? 'Negociação',
        value: deal.value ?? null,
        stage: (deal as Record<string, unknown> & { board_stages?: { name?: string } }).board_stages?.name ?? 'Desconhecido',
        board: (deal as Record<string, unknown> & { boards?: { name?: string } }).boards?.name ?? 'Desconhecido',
      })
    }

    // Atividades recentes
    const { data: activities } = await sb
      .from('activities')
      .select('type, title, completed, due_date')
      .eq('organization_id', organizationId)
      .eq('contact_id', contactData.id)
      .order('created_at', { ascending: false })
      .limit(5)

    recentActivities = (activities ?? []).map((a) => ({
      type: a.type ?? 'task',
      title: a.title ?? '',
      completed: a.completed ?? false,
      dueDate: a.due_date ?? null,
    }))
  }

  return {
    contact: contactData
      ? {
          id: contactData.id,
          name: [contactData.first_name, contactData.last_name].filter(Boolean).join(' ') || 'Visitante',
          phone: contactData.phone,
          email: contactData.email,
          company: companyName,
          lifecycleStage: contactData.lifecycle_stage ?? null,
          tags: contactData.tags ?? [],
        }
      : null,
    recentMessages,
    activeDeals,
    recentActivities,
  }
}

/**
 * Formata o contexto do contato para inclusão no system prompt do agente.
 */
export function formatContextForPrompt(ctx: ContactContext): string {
  const lines: string[] = []

  if (ctx.contact) {
    lines.push('=== INFORMAÇÕES DO CONTATO ===')
    lines.push(`Nome: ${ctx.contact.name}`)
    if (ctx.contact.company) lines.push(`Empresa: ${ctx.contact.company}`)
    if (ctx.contact.email) lines.push(`E-mail: ${ctx.contact.email}`)
    if (ctx.contact.lifecycleStage) lines.push(`Estágio: ${ctx.contact.lifecycleStage}`)
    if (ctx.contact.tags.length > 0) lines.push(`Tags: ${ctx.contact.tags.join(', ')}`)
  }

  if (ctx.activeDeals.length > 0) {
    lines.push('\n=== NEGOCIAÇÕES ATIVAS ===')
    for (const deal of ctx.activeDeals) {
      const value = deal.value ? `R$ ${deal.value.toLocaleString('pt-BR')}` : 'sem valor'
      lines.push(`• ${deal.title} — ${deal.stage} (${deal.board}) — ${value}`)
    }
  }

  if (ctx.recentActivities.length > 0) {
    lines.push('\n=== ATIVIDADES RECENTES ===')
    for (const act of ctx.recentActivities) {
      const status = act.completed ? '✓' : '○'
      lines.push(`${status} ${act.type}: ${act.title}`)
    }
  }

  return lines.join('\n')
}
