'use client'

/**
 * AICreditsCard — card de créditos IA nas Configurações.
 * Mostra saldo, consumo por tipo e histórico de transações.
 */
import React, { useState } from 'react'
import { Zap, TrendingDown, TrendingUp, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { SettingsSection } from './SettingsSection'

const REFERENCE_LABELS: Record<string, string> = {
  super_agent: 'Super Agente',
  prospecting: 'Prospecção',
  dispatch: 'Disparo',
  ai_chat: 'Chat IA',
  landing_page: 'Landing Page',
  ai_analysis: 'Análise IA',
  other: 'Outros',
}

async function fetchCreditsData(organizationId: string) {
  const [creditsRes, txnsRes] = await Promise.all([
    supabase
      .from('ai_credits')
      .select('balance, total_used, plan_limit, reset_at')
      .eq('organization_id', organizationId)
      .single(),
    supabase
      .from('ai_credit_transactions')
      .select('id, type, amount, description, reference_type, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  return {
    credits: creditsRes.data,
    transactions: txnsRes.data ?? [],
  }
}

export function AICreditsCard() {
  const { organizationId } = useAuth()
  const [showHistory, setShowHistory] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['ai-credits-detail', organizationId],
    queryFn: () => fetchCreditsData(organizationId!),
    enabled: !!organizationId,
    staleTime: 30_000,
  })

  const credits = data?.credits
  const usagePercent = credits
    ? Math.round(((credits.plan_limit - credits.balance) / credits.plan_limit) * 100)
    : 0

  const barColor =
    credits && credits.balance / credits.plan_limit > 0.4
      ? 'bg-emerald-500'
      : credits && credits.balance / credits.plan_limit > 0.15
      ? 'bg-amber-500'
      : 'bg-red-500'

  return (
    <SettingsSection title="Créditos de I.A" icon={Zap}>
      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-4 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-48" />
            <div className="h-2 bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
          </div>
        ) : credits ? (
          <>
            {/* Saldo principal */}
            <div className="flex items-end gap-3 mb-4">
              <div>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">
                  {credits.balance.toLocaleString('pt-BR')}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  créditos disponíveis de {credits.plan_limit.toLocaleString('pt-BR')}
                </p>
              </div>
              {credits.reset_at && (
                <p className="text-xs text-slate-400 mb-1">
                  Renova em {new Date(credits.reset_at).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>

            {/* Barra de progresso */}
            <div className="w-full h-2 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden mb-4">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${Math.max(2, 100 - usagePercent)}%` }}
              />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 text-center">
                <TrendingDown className="h-4 w-4 text-red-500 mx-auto mb-1" />
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  {credits.total_used.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-slate-500">Usados total</p>
              </div>
              <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 text-center">
                <Zap className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  {credits.balance.toLocaleString('pt-BR')}
                </p>
                <p className="text-xs text-slate-500">Disponíveis</p>
              </div>
              <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 text-center">
                <TrendingUp className="h-4 w-4 text-blue-500 mx-auto mb-1" />
                <p className="text-lg font-semibold text-slate-900 dark:text-white">{usagePercent}%</p>
                <p className="text-xs text-slate-500">Consumido</p>
              </div>
            </div>

            {/* Histórico toggle */}
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Histórico recente
              {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showHistory && (
              <div className="mt-3 space-y-2">
                {(data?.transactions ?? []).length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">Nenhuma transação ainda.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {(data?.transactions ?? []).map((t) => (
                      <div key={t.id} className="flex items-center justify-between py-2">
                        <div>
                          <p className="text-sm text-slate-700 dark:text-slate-300">
                            {t.description || REFERENCE_LABELS[t.reference_type ?? 'other'] || 'Transação'}
                          </p>
                          <p className="text-xs text-slate-400">
                            {new Date(t.created_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        <span
                          className={`text-sm font-semibold ${
                            t.type === 'credit' || t.type === 'refund'
                              ? 'text-emerald-600'
                              : 'text-red-500'
                          }`}
                        >
                          {t.type === 'debit' ? '-' : '+'}{t.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">Créditos não configurados para esta organização.</p>
        )}
      </div>
    </SettingsSection>
  )
}
