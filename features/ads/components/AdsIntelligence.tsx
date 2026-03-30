'use client'

import React, { useState } from 'react'
import { Brain, Loader2, Sparkles, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

interface InsightResult {
  summary: string
  topCampaign: string | null
  worstCampaign: string | null
  recommendations: string[]
  alerts: string[]
  generatedAt: string
}

function useAdCampaignData(orgId: string | undefined) {
  return useQuery({
    queryKey: ['ad-campaigns-for-ai', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ad_campaigns')
        .select('name, status, spend, leads, clicks, cpl, ctr, impressions')
        .eq('organization_id', orgId!)
        .order('spend', { ascending: false })
        .limit(20)

      return data ?? []
    },
    enabled: !!orgId,
  })
}

export function AdsIntelligence() {
  const { organizationId } = useAuth()
  const [insight, setInsight] = useState<InsightResult | null>(null)
  const { data: campaigns = [] } = useAdCampaignData(organizationId ?? undefined)

  const analyzeMutation = useMutation({
    mutationFn: async (): Promise<InsightResult> => {
      const res = await fetch('/api/ads/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaigns }),
      })
      if (!res.ok) throw new Error('Erro ao gerar análise')
      return res.json()
    },
    onSuccess: (data) => setInsight(data),
  })

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  const totalSpend = campaigns.reduce((acc, c) => acc + (Number(c.spend) || 0), 0)
  const totalLeads = campaigns.reduce((acc, c) => acc + (Number(c.leads) || 0), 0)
  const avgCPL = totalLeads > 0 ? totalSpend / totalLeads : null

  return (
    <div className="space-y-6">
      {/* Resumo para análise */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-500/30 rounded-2xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600 rounded-xl">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Análise de IA</h3>
              <p className="text-sm text-slate-500">Análise inteligente das suas campanhas</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending || campaigns.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {analyzeMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Analisando...</>
              : <><Sparkles className="h-4 w-4" /> Analisar</>
            }
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{campaigns.length}</p>
            <p className="text-xs text-slate-500">Campanhas</p>
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(totalSpend)}</p>
            <p className="text-xs text-slate-500">Investimento</p>
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{avgCPL ? formatCurrency(avgCPL) : '—'}</p>
            <p className="text-xs text-slate-500">CPL médio</p>
          </div>
        </div>
      </div>

      {analyzeMutation.isError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-xl p-4">
          <p className="text-sm text-red-600 dark:text-red-400">
            Erro ao gerar análise. Verifique se a IA está configurada corretamente.
          </p>
        </div>
      )}

      {/* Resultado da análise */}
      {insight && (
        <div className="space-y-4">
          {/* Resumo geral */}
          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
            <h4 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              Resumo
            </h4>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{insight.summary}</p>
          </div>

          {/* Melhores e piores campanhas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {insight.topCampaign && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/30 rounded-2xl p-4">
                <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4" /> Melhor desempenho
                </h4>
                <p className="text-sm text-emerald-800 dark:text-emerald-200">{insight.topCampaign}</p>
              </div>
            )}
            {insight.worstCampaign && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-2xl p-4">
                <h4 className="text-sm font-semibold text-red-700 dark:text-red-300 flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4" /> Precisa de atenção
                </h4>
                <p className="text-sm text-red-800 dark:text-red-200">{insight.worstCampaign}</p>
              </div>
            )}
          </div>

          {/* Recomendações */}
          {insight.recommendations.length > 0 && (
            <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
              <h4 className="font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                Recomendações
              </h4>
              <ul className="space-y-2">
                {insight.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <span className="flex-shrink-0 w-5 h-5 bg-amber-500/10 text-amber-600 rounded-full flex items-center justify-center text-xs font-bold mt-0.5">
                      {i + 1}
                    </span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Alertas */}
          {insight.alerts.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-5">
              <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Alertas
              </h4>
              <ul className="space-y-2">
                {insight.alerts.map((alert, i) => (
                  <li key={i} className="text-sm text-amber-700 dark:text-amber-300">
                    ⚠️ {alert}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-slate-400 text-right">
            Gerado em {new Date(insight.generatedAt).toLocaleString('pt-BR')}
          </p>
        </div>
      )}

      {!insight && !analyzeMutation.isPending && (
        <div className="text-center py-12 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
          <Brain className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500 text-sm">
            Clique em <strong>Analisar</strong> para gerar um relatório inteligente das suas campanhas.
          </p>
        </div>
      )}
    </div>
  )
}
