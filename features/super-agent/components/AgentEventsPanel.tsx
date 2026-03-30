'use client'

/**
 * AgentEventsPanel — painel flutuante de eventos do Super Agente em tempo real.
 * Fica no canto inferior direito e mostra as últimas interações.
 */
import React, { useState, useEffect } from 'react'
import { Bot, X, ChevronDown, ChevronUp, CheckCircle2, ArrowRightLeft, XCircle, Activity } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

interface LogEvent {
  id: string
  status: string
  input_message: string | null
  output_message: string | null
  credits_used: number
  created_at: string
  super_agents: Array<{ name: string }> | null
}

async function fetchRecentEvents(orgId: string): Promise<LogEvent[]> {
  const { data } = await supabase
    .from('super_agent_logs')
    .select('id, status, input_message, output_message, credits_used, created_at, super_agents(name)')
    .eq('organization_id', orgId)
    .neq('status', 'skipped')
    .order('created_at', { ascending: false })
    .limit(8)
  return (data ?? []) as LogEvent[]
}

function getTimeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  return `${Math.floor(diff / 3600)}h`
}

const STATUS_ICON: Record<string, React.ElementType> = {
  success: CheckCircle2,
  handoff: ArrowRightLeft,
  error: XCircle,
  fallback: Activity,
}

const STATUS_COLOR: Record<string, string> = {
  success: 'text-emerald-500',
  handoff: 'text-amber-500',
  error: 'text-red-500',
  fallback: 'text-blue-500',
}

export function AgentEventsPanel() {
  const { organizationId } = useAuth()
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)

  const { data: events = [] } = useQuery({
    queryKey: ['super-agent-events', organizationId],
    queryFn: () => fetchRecentEvents(organizationId!),
    enabled: !!organizationId,
    refetchInterval: 15_000,
  })

  // Realtime subscription nos logs
  useEffect(() => {
    if (!organizationId) return
    const channel = supabase
      .channel('super-agent-events')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'super_agent_logs',
        filter: `organization_id=eq.${organizationId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['super-agent-events'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [organizationId, queryClient])

  const activeAgents = events.filter((e) => e.status === 'success').length
  const hasRecentActivity = events.length > 0

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      {/* Painel expandido */}
      {isOpen && !isMinimized && (
        <div className="w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/5 bg-purple-50/50 dark:bg-purple-900/10">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-semibold text-slate-900 dark:text-white">Eventos do Agente</span>
              {hasRecentActivity && (
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
              )}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {events.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <Bot className="h-6 w-6 mx-auto mb-2 opacity-40" />
                <p className="text-xs">Nenhuma atividade recente.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-50 dark:divide-white/5">
                {events.map((event) => {
                  const Icon = STATUS_ICON[event.status] ?? Activity
                  return (
                    <li key={event.id} className="px-4 py-2.5">
                      <div className="flex items-start gap-2">
                        <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${STATUS_COLOR[event.status] ?? 'text-slate-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                            {event.super_agents?.[0]?.name ?? 'Agente'}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {event.input_message?.slice(0, 50) ?? '—'}
                          </p>
                        </div>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                          {getTimeAgo(event.created_at)}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Botão flutuante */}
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); setIsMinimized(false) }}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-lg font-medium text-sm transition-all ${
          isOpen
            ? 'bg-purple-600 text-white hover:bg-purple-700'
            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-purple-50 dark:hover:bg-purple-900/20'
        }`}
        aria-label="Eventos do Super Agente"
      >
        <Bot className="h-4 w-4" />
        <span>Eventos</span>
        {hasRecentActivity && !isOpen && (
          <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
        )}
        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
