'use client'

import React, { useState } from 'react'
import {
  Play, Pause, AlertCircle, CheckCircle2, ChevronDown, ChevronUp,
  DollarSign, Users, MousePointerClick, TrendingDown
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

interface Campaign {
  id: string
  name: string | null
  status: string | null
  objective: string | null
  budget_daily: number | null
  budget_lifetime: number | null
  spend: number
  impressions: number
  clicks: number
  leads: number
  cpl: number | null
  ctr: number | null
  date_start: string | null
  date_end: string | null
  synced_at: string | null
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  ACTIVE: { label: 'Ativa', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20', icon: Play },
  PAUSED: { label: 'Pausada', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20', icon: Pause },
  DELETED: { label: 'Deletada', color: 'text-slate-500 bg-slate-100 dark:bg-white/10', icon: AlertCircle },
  ARCHIVED: { label: 'Arquivada', color: 'text-slate-500 bg-slate-100 dark:bg-white/10', icon: AlertCircle },
  COMPLETED: { label: 'Concluída', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', icon: CheckCircle2 },
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(value)
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const [expanded, setExpanded] = useState(false)
  const status = campaign.status?.toUpperCase() ?? ''
  const meta = STATUS_META[status] ?? { label: status || 'Desconhecido', color: 'text-slate-500 bg-slate-100 dark:bg-white/10', icon: AlertCircle }
  const Icon = meta.icon

  return (
    <div className="border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-slate-900 dark:text-white truncate">
              {campaign.name ?? 'Campanha sem nome'}
            </h3>
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${meta.color}`}>
              <Icon className="h-3 w-3" />
              {meta.label}
            </span>
          </div>
          {campaign.objective && (
            <p className="text-xs text-slate-500">{campaign.objective}</p>
          )}
        </div>

        {/* Métricas resumidas */}
        <div className="hidden sm:flex items-center gap-6 text-sm">
          <div className="text-right">
            <p className="font-semibold text-slate-900 dark:text-white">{formatCurrency(campaign.spend)}</p>
            <p className="text-xs text-slate-400">Investido</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-slate-900 dark:text-white">{campaign.leads.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-slate-400">Leads</p>
          </div>
          {campaign.cpl !== null && (
            <div className="text-right">
              <p className="font-semibold text-slate-900 dark:text-white">{formatCurrency(campaign.cpl)}</p>
              <p className="text-xs text-slate-400">CPL</p>
            </div>
          )}
        </div>

        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-slate-200 dark:border-white/10 p-4 bg-slate-50 dark:bg-black/10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><DollarSign className="h-3 w-3" />Investimento</p>
              <p className="font-semibold text-slate-900 dark:text-white">{formatCurrency(campaign.spend)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Users className="h-3 w-3" />Leads</p>
              <p className="font-semibold text-slate-900 dark:text-white">{campaign.leads.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><MousePointerClick className="h-3 w-3" />Cliques</p>
              <p className="font-semibold text-slate-900 dark:text-white">{campaign.clicks.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><TrendingDown className="h-3 w-3" />Impressões</p>
              <p className="font-semibold text-slate-900 dark:text-white">{campaign.impressions.toLocaleString()}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">CPL</p>
              <p className="font-medium text-slate-900 dark:text-white">{campaign.cpl ? formatCurrency(campaign.cpl) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">CTR</p>
              <p className="font-medium text-slate-900 dark:text-white">{campaign.ctr ? `${Number(campaign.ctr).toFixed(2)}%` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Orçamento diário</p>
              <p className="font-medium text-slate-900 dark:text-white">{campaign.budget_daily ? formatCurrency(Number(campaign.budget_daily)) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Última sync</p>
              <p className="font-medium text-slate-900 dark:text-white text-xs">
                {campaign.synced_at ? new Date(campaign.synced_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function CampaignsList() {
  const { organizationId } = useAuth()
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['ad-campaigns', organizationId],
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase
        .from('ad_campaigns')
        .select('id, name, status, objective, budget_daily, budget_lifetime, spend, impressions, clicks, leads, cpl, ctr, date_start, date_end, synced_at')
        .eq('organization_id', organizationId!)
        .order('spend', { ascending: false })
        .limit(100)

      if (error) throw error
      return data ?? []
    },
    enabled: !!organizationId,
  })

  const filtered = statusFilter === 'all'
    ? campaigns
    : campaigns.filter((c) => (c.status ?? '').toUpperCase() === statusFilter)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtros de status */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: 'all', label: 'Todas' },
          { value: 'ACTIVE', label: 'Ativas' },
          { value: 'PAUSED', label: 'Pausadas' },
          { value: 'COMPLETED', label: 'Concluídas' },
          { value: 'ARCHIVED', label: 'Arquivadas' },
        ].map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              statusFilter === f.value
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
          <p className="text-slate-500">Nenhuma campanha encontrada. Conecte sua conta de anúncios e sincronize.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  )
}
