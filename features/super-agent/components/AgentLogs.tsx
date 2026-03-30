'use client'

import React, { useState } from 'react'
import { ScrollText, RefreshCw, CheckCircle2, XCircle, ArrowRightLeft, AlertCircle, Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

interface Log {
  id: string
  agent_id: string | null
  input_message: string | null
  output_message: string | null
  tokens_used: number | null
  credits_used: number
  response_time_ms: number | null
  status: 'success' | 'error' | 'fallback' | 'handoff' | 'skipped'
  created_at: string
  super_agents: Array<{ name: string }> | null
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  success: { label: 'Sucesso', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20', icon: CheckCircle2 },
  handoff: { label: 'Transferido', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20', icon: ArrowRightLeft },
  error: { label: 'Erro', color: 'text-red-600 bg-red-50 dark:bg-red-900/20', icon: XCircle },
  fallback: { label: 'Fallback', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', icon: AlertCircle },
  skipped: { label: 'Ignorado', color: 'text-slate-500 bg-slate-100 dark:bg-white/10', icon: AlertCircle },
}

async function fetchLogs(orgId: string): Promise<Log[]> {
  const { data } = await supabase
    .from('super_agent_logs')
    .select('id, agent_id, input_message, output_message, tokens_used, credits_used, response_time_ms, status, created_at, super_agents(name)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []) as Log[]
}

export function AgentLogs() {
  const { organizationId } = useAuth()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['super-agent-logs', organizationId],
    queryFn: () => fetchLogs(organizationId!),
    enabled: !!organizationId,
    refetchInterval: 30_000,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{logs.length} registros recentes</p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-slate-100 dark:bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum log ainda. O agente precisa estar ativo e receber mensagens.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const meta = STATUS_META[log.status] ?? STATUS_META.skipped
            const Icon = meta.icon
            return (
              <div
                key={log.id}
                className="border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 rounded-xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  <span className="text-sm text-slate-500 truncate flex-1">
                    {log.super_agents?.[0]?.name ?? 'Agente'} — {log.input_message?.slice(0, 60) ?? '(sem texto)'}
                  </span>
                  <div className="flex items-center gap-3 text-xs text-slate-400 flex-shrink-0">
                    {log.credits_used > 0 && <span>−{log.credits_used} créditos</span>}
                    {log.response_time_ms && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{log.response_time_ms}ms</span>}
                    <span>{new Date(log.created_at).toLocaleString('pt-BR', { timeStyle: 'short', dateStyle: 'short' })}</span>
                  </div>
                </button>

                {expandedId === log.id && (
                  <div className="px-4 pb-4 border-t border-slate-100 dark:border-white/5 pt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Entrada</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{log.input_message ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Resposta</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{log.output_message ?? '—'}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
