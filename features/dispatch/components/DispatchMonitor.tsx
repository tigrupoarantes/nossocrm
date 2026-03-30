'use client'

import React from 'react'
import { CheckCircle2, XCircle, Clock, Send, MessageSquare, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

interface Dispatch {
  id: string
  name: string
  status: string
  total_recipients: number
  sent_count: number
  failed_count: number
  created_at: string
  completed_at: string | null
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Rascunho', color: 'text-slate-500 bg-slate-100 dark:bg-white/10', icon: Clock },
  pending: { label: 'Aguardando', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20', icon: Clock },
  running: { label: 'Enviando', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', icon: Send },
  completed: { label: 'Concluído', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20', icon: CheckCircle2 },
  failed: { label: 'Falhou', color: 'text-red-600 bg-red-50 dark:bg-red-900/20', icon: XCircle },
  cancelled: { label: 'Cancelado', color: 'text-slate-500 bg-slate-100 dark:bg-white/10', icon: XCircle },
}

function ProgressBar({ sent, failed, total }: { sent: number; failed: number; total: number }) {
  const sentPct = total > 0 ? (sent / total) * 100 : 0
  const failedPct = total > 0 ? (failed / total) * 100 : 0

  return (
    <div className="h-2 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden flex">
      <div className="bg-emerald-500 h-full rounded-l-full transition-all" style={{ width: `${sentPct}%` }} />
      <div className="bg-red-400 h-full transition-all" style={{ width: `${failedPct}%` }} />
    </div>
  )
}

export function DispatchMonitor() {
  const { organizationId } = useAuth()

  const { data: dispatches = [], isLoading, refetch } = useQuery({
    queryKey: ['mass-dispatches', organizationId],
    queryFn: async (): Promise<Dispatch[]> => {
      const res = await fetch('/api/dispatch/mass')
      if (!res.ok) throw new Error('Erro ao buscar disparos')
      const data = await res.json()
      return data.dispatches ?? []
    },
    enabled: !!organizationId,
    refetchInterval: (query) => {
      // Refresh a cada 5s se houver disparo rodando
      const hasRunning = (query?.state?.data as Dispatch[] | undefined)?.some((d) => d.status === 'running' || d.status === 'pending')
      return hasRunning ? 5_000 : 30_000
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  if (dispatches.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
        <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-400 opacity-40" />
        <p className="text-slate-500">Nenhum disparo realizado ainda.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{dispatches.length} disparos registrados</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </button>
      </div>

      {dispatches.map((dispatch) => {
        const meta = STATUS_META[dispatch.status] ?? STATUS_META.pending
        const Icon = meta.icon
        const progress = dispatch.total_recipients > 0
          ? Math.round(((dispatch.sent_count + dispatch.failed_count) / dispatch.total_recipients) * 100)
          : 0

        return (
          <div key={dispatch.id} className="border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">{dispatch.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(dispatch.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  {dispatch.completed_at && ` → ${new Date(dispatch.completed_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}>
                <Icon className="h-3 w-3" />
                {meta.label}
              </span>
            </div>

            {dispatch.total_recipients > 0 && (
              <div className="mb-2">
                <ProgressBar
                  sent={dispatch.sent_count}
                  failed={dispatch.failed_count}
                  total={dispatch.total_recipients}
                />
              </div>
            )}

            <div className="grid grid-cols-4 gap-2 text-center mt-2">
              {[
                { label: 'Total', value: dispatch.total_recipients, color: 'text-slate-900 dark:text-white' },
                { label: 'Enviados', value: dispatch.sent_count, color: 'text-emerald-600' },
                { label: 'Falhos', value: dispatch.failed_count, color: 'text-red-500' },
                { label: 'Progresso', value: `${progress}%`, color: 'text-blue-600' },
              ].map((stat) => (
                <div key={stat.label} className="bg-slate-50 dark:bg-white/5 rounded-lg p-2">
                  <p className={`text-base font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-slate-400">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
