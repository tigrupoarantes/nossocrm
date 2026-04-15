'use client'

import React, { useState } from 'react'
import { MessageSquare, Search, Filter, Plus } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { useRealtimeSync } from '@/lib/realtime/useRealtimeSync'
import type { ConversationChannel } from '@/types'
import { ChannelIcon } from './components/ChannelBadge'

type FilterType = 'open' | 'all' | 'unread'

interface Conversation {
  id: string
  wa_chat_id: string | null
  contact_id: string | null
  channel: ConversationChannel
  status: string | null
  unread_count: number | null
  last_message_at: string | null
  last_message_body: string | null
  contact_name?: string
  contact_phone?: string
}

const FILTER_LABELS: Record<FilterType, string> = {
  open: 'Abertas',
  all: 'Todas',
  unread: 'Não lidas',
}

function ConversationListItem({
  conversation,
  onClick,
}: {
  conversation: Conversation
  onClick: () => void
}) {
  const name = conversation.contact_name ?? conversation.contact_phone ?? conversation.wa_chat_id ?? 'Desconhecido'
  const hasUnread = (conversation.unread_count ?? 0) > 0

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left border-b border-slate-100 dark:border-white/5 last:border-0 cv-auto cv-row-lg"
    >
      <div className="relative shrink-0">
        <div className="w-10 h-10 bg-slate-200 dark:bg-white/10 rounded-full flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300">
          {name.charAt(0).toUpperCase()}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 bg-white dark:bg-slate-900 rounded-full p-0.5 shadow-sm">
          <ChannelIcon channel={conversation.channel} size={14} />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-sm truncate ${hasUnread ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
            {name}
          </p>
          {conversation.last_message_at && (
            <time className="text-xs text-slate-400 flex-shrink-0">
              {new Date(conversation.last_message_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </time>
          )}
        </div>
        {conversation.last_message_body && (
          <p className="text-xs text-slate-500 truncate mt-0.5">{conversation.last_message_body}</p>
        )}
      </div>
      {hasUnread && (
        <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
          {conversation.unread_count! > 9 ? '9+' : conversation.unread_count}
        </span>
      )}
    </button>
  )
}

export function ConversationsPage() {
  const { organizationId } = useAuth()
  const router = useRouter()
  const [filter, setFilter] = useState<FilterType>('open')
  const [search, setSearch] = useState('')

  // Realtime: invalida a lista quando chega nova mensagem/conversa. Cobre o
  // caso do usuário estar com a tela aberta recebendo inbound ao vivo. A
  // queryKey da lista é `['conversations-page', ...]` que não é prefixo do
  // mapping default do hook — invalidamos explicitamente via callback.
  const queryClient = useQueryClient()
  useRealtimeSync(['messages', 'conversations'], {
    onchange: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations-page'], exact: false })
    },
  })

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['conversations-page', organizationId, filter],
    queryFn: async (): Promise<Conversation[]> => {
      let query = supabase
        .from('conversations')
        .select(`
          id, wa_chat_id, contact_id, channel, status, unread_count, last_message_at, last_message_body,
          contacts (first_name, last_name, phone)
        `)
        .eq('organization_id', organizationId!)
        .order('last_message_at', { ascending: false })
        .limit(100)

      if (filter === 'open') query = query.eq('status', 'open')
      if (filter === 'unread') query = query.gt('unread_count', 0)

      const { data } = await query

      return (data ?? []).map((c) => {
        const contact = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts
        return {
          ...c,
          contact_name: contact
            ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || undefined
            : undefined,
          contact_phone: contact?.phone ?? undefined,
        }
      })
    },
    enabled: !!organizationId,
    // Fallback polling 30s caso o Realtime caia; a UX principal é via WS.
    refetchInterval: 30_000,
  })

  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true
    const name = (c.contact_name ?? c.contact_phone ?? '').toLowerCase()
    return name.includes(search.toLowerCase())
  })

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-xl">
              <MessageSquare className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Conversas</h1>
              <p className="text-sm text-slate-500">{filtered.length} conversa{filtered.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/inbox')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Abrir Inbox
          </button>
        </div>

        {/* Filtros */}
        <div className="flex gap-2">
          {(Object.keys(FILTER_LABELS) as FilterType[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <Filter className="h-3 w-3" />
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Lista de conversas */}
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="space-y-0">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-0">
                  <div className="w-10 h-10 bg-slate-100 dark:bg-white/10 rounded-full animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-slate-100 dark:bg-white/10 rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-slate-100 dark:bg-white/10 rounded animate-pulse w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-400 opacity-40" />
              <p className="text-slate-500">
                {search ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda.'}
              </p>
            </div>
          ) : (
            <div>
              {filtered.map((conversation) => (
                <ConversationListItem
                  key={conversation.id}
                  conversation={conversation}
                  onClick={() => router.push(`/inbox?conversation=${conversation.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
