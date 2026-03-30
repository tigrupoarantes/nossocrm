'use client'

import React, { useState } from 'react'
import { Search, Send, History } from 'lucide-react'
import { ProspectingSearch } from './components/ProspectingSearch'
import { ProspectingHistory } from './components/ProspectingHistory'
import { DirectDispatch } from './components/DirectDispatch'

type Tab = 'search' | 'history' | 'direct'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'search', label: 'Prospectar', icon: Search },
  { id: 'history', label: 'Histórico', icon: History },
  { id: 'direct', label: 'Disparo Direto', icon: Send },
]

export function ProspectingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('search')

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Search className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Prospecção</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Encontre e contate novos leads por segmento e cidade
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-8 border-b border-slate-200 dark:border-white/10">
        {TABS.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      {activeTab === 'search' && <ProspectingSearch />}
      {activeTab === 'history' && <ProspectingHistory />}
      {activeTab === 'direct' && <DirectDispatch />}
    </div>
  )
}
