'use client'

import React, { useState } from 'react'
import { BarChart3, Brain, Zap, Search, Trophy, Clock } from 'lucide-react'
import dynamic from 'next/dynamic'
import { PageLoader } from '@/components/PageLoader'
import { TopSellersRanking } from './components/TopSellersRanking'
import { HourlyAttendanceChart } from './components/HourlyAttendanceChart'
import { ProspectingWidget } from './components/ProspectingWidget'

const DashboardPage = dynamic(
  () => import('./DashboardPage'),
  { loading: () => <PageLoader />, ssr: false }
)

type TabId = 'vendas' | 'ai' | 'automacoes' | 'prospeccao'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'vendas', label: 'Vendas', icon: BarChart3 },
  { id: 'ai', label: 'Análise IA', icon: Brain },
  { id: 'automacoes', label: 'Automações', icon: Zap },
  { id: 'prospeccao', label: 'Prospecção', icon: Search },
]

function AIAnalysisTab() {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const analyze = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/dashboard-summary', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setSummary(data.summary)
      }
    } catch {
      setSummary('Erro ao gerar análise. Verifique a configuração de IA.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-500/30 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-600 rounded-xl">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Análise Inteligente do CRM</h3>
            <p className="text-sm text-slate-500">Insights gerados por IA sobre seu pipeline e clientes</p>
          </div>
        </div>
        <button
          type="button"
          onClick={analyze}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors text-sm"
        >
          {loading ? 'Analisando...' : '✨ Gerar análise'}
        </button>
      </div>

      {summary && (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
          <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Resumo da IA</h4>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {/* Top Sellers */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          Top Vendedores
        </h3>
        <TopSellersRanking />
      </div>

      {/* Horários de atendimento */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-500" />
          Atendimentos por Hora
        </h3>
        <HourlyAttendanceChart />
      </div>
    </div>
  )
}

function AutomacoesTab() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: 'Super Agente', desc: 'Configure e monitore seus agentes de IA', href: '/super-agent', color: 'bg-purple-500', icon: '🤖' },
          { label: 'Anúncios', desc: 'Rastreie campanhas e conversões CAPI', href: '/ads', color: 'bg-blue-500', icon: '📢' },
          { label: 'Disparo em Massa', desc: 'Envie mensagens para múltiplos contatos', href: '/dispatch', color: 'bg-emerald-500', icon: '📤' },
          { label: 'Notificações', desc: 'Configure alertas e preferências', href: '/settings#notifications', color: 'bg-amber-500', icon: '🔔' },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex items-start gap-4 p-5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors"
          >
            <div className={`${item.color} w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0`}>
              {item.icon}
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{item.label}</p>
              <p className="text-sm text-slate-500 mt-0.5">{item.desc}</p>
            </div>
          </a>
        ))}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-5">
        <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Facebook CAPI</h4>
        <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
          Configure o rastreamento server-side para melhorar a atribuição de conversões.
        </p>
        <a
          href="/settings"
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline font-medium"
        >
          Configurar Facebook CAPI →
        </a>
      </div>
    </div>
  )
}

export function DashboardTabsWrapper() {
  const [activeTab, setActiveTab] = useState<TabId>('vendas')

  return (
    <div className="flex flex-col space-y-4">
      {/* Tab navigation */}
      <div className="flex gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-2xl w-fit shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-white/10 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'vendas' && <DashboardPage />}
      {activeTab === 'ai' && <AIAnalysisTab />}
      {activeTab === 'automacoes' && <AutomacoesTab />}
      {activeTab === 'prospeccao' && (
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Central de Prospecção</h2>
          <ProspectingWidget />
        </div>
      )}
    </div>
  )
}
