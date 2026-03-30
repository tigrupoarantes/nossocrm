'use client'

import React from 'react'
import { History, TrendingUp, Users, Send, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

interface Campaign {
  id: string
  name: string
  segment: string
  city: string | null
  status: string
  total_leads: number
  leads_contacted: number
  created_at: string
}

async function fetchCampaigns(orgId: string): Promise<Campaign[]> {
  const { data } = await supabase
    .from('prospecting_campaigns')
    .select('id, name, segment, city, status, total_leads, leads_contacted, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(20)
  return data ?? []
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  completed: { label: 'Concluída', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20', icon: CheckCircle2 },
  running: { label: 'Executando', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', icon: Clock },
  pending: { label: 'Pendente', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20', icon: Clock },
  cancelled: { label: 'Cancelada', color: 'text-slate-500 bg-slate-100 dark:bg-white/10', icon: XCircle },
}

export function ProspectingHistory() {
  const { organizationId } = useAuth()

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['prospecting-campaigns', organizationId],
    queryFn: () => fetchCampaigns(organizationId!),
    enabled: !!organizationId,
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
        <History className="h-8 w-8 mx-auto mb-2 text-slate-400 opacity-40" />
        <p className="text-slate-500">Nenhuma prospecção realizada ainda.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {campaigns.map((campaign) => {
        const meta = STATUS_META[campaign.status] ?? STATUS_META.pending
        const Icon = meta.icon
        return (
          <div
            key={campaign.id}
            className="border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 rounded-2xl p-4"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">{campaign.name}</h3>
                <p className="text-sm text-slate-500">
                  {campaign.segment}{campaign.city ? ` em ${campaign.city}` : ''}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}>
                <Icon className="h-3 w-3" />
                {meta.label}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-2">
                <div className="flex items-center justify-center gap-1 text-blue-600 mb-0.5">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{campaign.total_leads}</p>
                <p className="text-xs text-slate-500">Leads</p>
              </div>
              <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-2">
                <div className="flex items-center justify-center gap-1 text-emerald-600 mb-0.5">
                  <Send className="h-3.5 w-3.5" />
                </div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{campaign.leads_contacted}</p>
                <p className="text-xs text-slate-500">Contactados</p>
              </div>
              <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-2">
                <div className="flex items-center justify-center gap-1 text-purple-600 mb-0.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                </div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {campaign.total_leads > 0
                    ? Math.round((campaign.leads_contacted / campaign.total_leads) * 100)
                    : 0}%
                </p>
                <p className="text-xs text-slate-500">Taxa</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              {new Date(campaign.created_at).toLocaleDateString('pt-BR', { dateStyle: 'medium' })}
            </p>
          </div>
        )
      })}
    </div>
  )
}
