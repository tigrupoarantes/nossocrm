'use client'

import React, { useState } from 'react'
import { Megaphone, BarChart3, List, Brain, Zap, Link2 } from 'lucide-react'
import { AdsDashboard } from './components/AdsDashboard'
import { CampaignsList } from './components/CampaignsList'
import { AdsIntelligence } from './components/AdsIntelligence'
import { AdsTracking } from './components/AdsTracking'

type TabId = 'dashboard' | 'campaigns' | 'intelligence' | 'tracking'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'campaigns', label: 'Campanhas', icon: List },
  { id: 'intelligence', label: 'Análise IA', icon: Brain },
  { id: 'tracking', label: 'Rastreamento', icon: Zap },
]

export function AdsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 rounded-xl">
              <Megaphone className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Anúncios</h1>
              <p className="text-sm text-slate-500">Gerencie campanhas e rastreie conversões</p>
            </div>
          </div>
          <a
            href="/connections"
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <Link2 className="h-4 w-4" />
            Conectar conta
          </a>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-2xl w-full sm:w-fit">
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

        {/* Content */}
        {activeTab === 'dashboard' && <AdsDashboard />}
        {activeTab === 'campaigns' && <CampaignsList />}
        {activeTab === 'intelligence' && <AdsIntelligence />}
        {activeTab === 'tracking' && <AdsTracking />}
      </div>
    </div>
  )
}
