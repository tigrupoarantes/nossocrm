'use client'

import React from 'react'
import { DollarSign, Users, MousePointerClick, TrendingUp, RefreshCw, Loader2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useOptionalToast } from '@/context/ToastContext'
import { PeriodFilter, type DatePreset } from './PeriodFilter'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useState } from 'react'

interface AggregatedMetrics {
  totalSpend: number
  totalLeads: number
  totalClicks: number
  totalImpressions: number
  avgCPL: number | null
  avgCTR: number | null
  campaignsCount: number
}

function useAdMetrics(orgId: string | undefined, datePreset: DatePreset) {
  return useQuery({
    queryKey: ['ad-metrics', orgId, datePreset],
    queryFn: async (): Promise<AggregatedMetrics> => {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .select('spend, leads, clicks, impressions, cpl, ctr')
        .eq('organization_id', orgId!)

      if (error) throw error

      const campaigns = data ?? []
      const total = campaigns.reduce(
        (acc, c) => ({
          spend: acc.spend + (c.spend ?? 0),
          leads: acc.leads + (c.leads ?? 0),
          clicks: acc.clicks + (c.clicks ?? 0),
          impressions: acc.impressions + (c.impressions ?? 0),
        }),
        { spend: 0, leads: 0, clicks: 0, impressions: 0 }
      )

      const avgCPL = total.leads > 0 ? total.spend / total.leads : null
      const avgCTR = total.impressions > 0 ? (total.clicks / total.impressions) * 100 : null

      return {
        totalSpend: total.spend,
        totalLeads: total.leads,
        totalClicks: total.clicks,
        totalImpressions: total.impressions,
        avgCPL,
        avgCTR,
        campaignsCount: campaigns.length,
      }
    },
    enabled: !!orgId,
  })
}

function useCampaignChart(orgId: string | undefined) {
  return useQuery({
    queryKey: ['ad-campaign-chart', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ad_campaigns')
        .select('name, spend, leads, clicks')
        .eq('organization_id', orgId!)
        .order('spend', { ascending: false })
        .limit(8)

      return (data ?? []).map((c) => ({
        name: c.name ? (c.name.length > 20 ? c.name.slice(0, 20) + '…' : c.name) : 'Sem nome',
        spend: Number(c.spend ?? 0),
        leads: Number(c.leads ?? 0),
        clicks: Number(c.clicks ?? 0),
      }))
    },
    enabled: !!orgId,
  })
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">{label}</p>
        <div className={`p-2 rounded-xl ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function AdsDashboard() {
  const { organizationId } = useAuth()
  const { addToast } = useOptionalToast()
  const queryClient = useQueryClient()
  const [datePreset, setDatePreset] = useState<DatePreset>('last_30d')

  const { data: metrics, isLoading: loadingMetrics } = useAdMetrics(organizationId ?? undefined, datePreset)
  const { data: chartData = [], isLoading: loadingChart } = useCampaignChart(organizationId ?? undefined)

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ads/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datePreset }) })
      if (!res.ok) throw new Error('Erro ao sincronizar')
      return res.json()
    },
    onSuccess: (data) => {
      addToast?.(`${data.campaignsSynced} campanhas sincronizadas!`, 'success')
      queryClient.invalidateQueries({ queryKey: ['ad-metrics'] })
      queryClient.invalidateQueries({ queryKey: ['ad-campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['ad-campaign-chart'] })
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  return (
    <div className="space-y-6">
      {/* Header com filtro de período */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <PeriodFilter value={datePreset} onChange={setDatePreset} />
        <button
          type="button"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {syncMutation.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Sincronizando...</>
            : <><RefreshCw className="h-4 w-4" /> Sincronizar</>
          }
        </button>
      </div>

      {/* Métricas principais */}
      {loadingMetrics ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Investimento"
            value={formatCurrency(metrics?.totalSpend ?? 0)}
            sub={`${metrics?.campaignsCount ?? 0} campanhas`}
            icon={DollarSign}
            color="bg-blue-500/10 text-blue-600"
          />
          <MetricCard
            label="Leads Gerados"
            value={(metrics?.totalLeads ?? 0).toLocaleString('pt-BR')}
            sub={metrics?.avgCPL ? `CPL: ${formatCurrency(metrics.avgCPL)}` : 'Sem conversões'}
            icon={Users}
            color="bg-emerald-500/10 text-emerald-600"
          />
          <MetricCard
            label="Cliques"
            value={(metrics?.totalClicks ?? 0).toLocaleString('pt-BR')}
            sub={metrics?.avgCTR ? `CTR: ${metrics.avgCTR.toFixed(2)}%` : undefined}
            icon={MousePointerClick}
            color="bg-purple-500/10 text-purple-600"
          />
          <MetricCard
            label="Impressões"
            value={(metrics?.totalImpressions ?? 0).toLocaleString('pt-BR')}
            sub={metrics?.avgCTR ? `CTR médio: ${metrics.avgCTR.toFixed(2)}%` : undefined}
            icon={TrendingUp}
            color="bg-amber-500/10 text-amber-600"
          />
        </div>
      )}

      {/* Gráfico de Investimento por Campanha */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
          Investimento por Campanha
        </h3>
        {loadingChart ? (
          <div className="h-48 bg-slate-100 dark:bg-white/5 rounded-xl animate-pulse" />
        ) : chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
            Nenhuma campanha sincronizada ainda.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `R$${v}`} />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), 'Investimento']}
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f8fafc' }}
              />
              <Bar dataKey="spend" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico de Leads por Campanha */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">
          Leads por Campanha
        </h3>
        {loadingChart ? (
          <div className="h-48 bg-slate-100 dark:bg-white/5 rounded-xl animate-pulse" />
        ) : chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
            Nenhuma campanha com leads ainda.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                formatter={(value: number) => [value, 'Leads']}
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f8fafc' }}
              />
              <Bar dataKey="leads" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
