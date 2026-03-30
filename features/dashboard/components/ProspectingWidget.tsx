'use client'

import React from 'react'
import { Search, Send, Users, TrendingUp, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'

export function ProspectingWidget() {
  const { organizationId } = useAuth()
  const router = useRouter()

  const { data: stats } = useQuery({
    queryKey: ['prospecting-widget-stats', organizationId],
    queryFn: async () => {
      const [campaignsRes, dispatchesRes, massDispatchesRes] = await Promise.all([
        supabase
          .from('prospecting_campaigns')
          .select('id, status, total_leads, leads_contacted')
          .eq('organization_id', organizationId!)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('prospecting_dispatches')
          .select('id, status')
          .eq('organization_id', organizationId!),
        supabase
          .from('mass_dispatches')
          .select('id, status, total_recipients, sent_count')
          .eq('organization_id', organizationId!)
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      const campaigns = campaignsRes.data ?? []
      const dispatches = dispatchesRes.data ?? []
      const massDispatches = massDispatchesRes.data ?? []

      const runningCampaign = campaigns.find((c) => c.status === 'running') ?? null
      const totalLeads = campaigns.reduce((acc, c) => acc + (c.total_leads ?? 0), 0)
      const totalContacted = campaigns.reduce((acc, c) => acc + (c.leads_contacted ?? 0), 0)
      const totalDispatches = dispatches.length
      const sentDispatches = dispatches.filter((d) => d.status === 'sent').length

      const runningMassDispatch = massDispatches.find((d) => d.status === 'running') ?? null
      const totalMassSent = massDispatches.reduce((acc, d) => acc + (d.sent_count ?? 0), 0)

      return {
        campaignsCount: campaigns.length,
        totalLeads,
        totalContacted,
        totalDispatches,
        sentDispatches,
        runningCampaign,
        runningMassDispatch,
        totalMassSent,
      }
    },
    enabled: !!organizationId,
    refetchInterval: 30_000,
  })

  const cards = [
    {
      label: 'Prospecções',
      value: stats?.campaignsCount ?? 0,
      icon: Search,
      color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Leads encontrados',
      value: stats?.totalLeads ?? 0,
      icon: Users,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      label: 'Disparos enviados',
      value: (stats?.sentDispatches ?? 0) + (stats?.totalMassSent ?? 0),
      icon: Send,
      color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20',
    },
    {
      label: 'Taxa de contato',
      value: stats?.totalLeads
        ? `${Math.round((stats.totalContacted / stats.totalLeads) * 100)}%`
        : '—',
      icon: TrendingUp,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
    },
  ]

  return (
    <div className="space-y-4">
      {/* Disparo em andamento */}
      {(stats?.runningCampaign || stats?.runningMassDispatch) && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
              {stats.runningCampaign ? 'Prospecção em andamento' : 'Disparo em andamento'}
            </p>
          </div>
          {stats.runningMassDispatch && (
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {stats.runningMassDispatch.sent_count} / {stats.runningMassDispatch.total_recipients} mensagens enviadas
            </p>
          )}
        </div>
      )}

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4">
              <div className={`inline-flex p-2 rounded-xl ${card.color} mb-2`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {typeof card.value === 'number' ? card.value.toLocaleString('pt-BR') : card.value}
              </p>
              <p className="text-xs text-slate-500 mt-1">{card.label}</p>
            </div>
          )
        })}
      </div>

      {/* Quick links */}
      <div className="space-y-2">
        {[
          { label: 'Iniciar nova prospecção', href: '/prospecting', icon: Search },
          { label: 'Disparo em massa', href: '/dispatch', icon: Send },
        ].map((link) => {
          const Icon = link.icon
          return (
            <button
              key={link.href}
              type="button"
              onClick={() => router.push(link.href)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-50 dark:hover:bg-white/10 transition-colors text-left"
            >
              <Icon className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{link.label}</span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
