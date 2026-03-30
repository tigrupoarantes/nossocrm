'use client'

/**
 * SuperAgentPage — container principal do módulo Super Agente.
 * Abas: Agentes | Modelos | Config Global | Logs | Eventos
 */
import React, { useState } from 'react'
import { Bot, LayoutTemplate, Settings2, ScrollText, Activity } from 'lucide-react'
import { AgentsList } from './components/AgentsList'
import { AgentModels } from './components/AgentModels'
import { AgentConfigGlobal } from './components/AgentConfigGlobal'
import { AgentLogs } from './components/AgentLogs'

type Tab = 'agents' | 'models' | 'config' | 'logs'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'agents', label: 'Agentes', icon: Bot },
  { id: 'models', label: 'Modelos', icon: LayoutTemplate },
  { id: 'config', label: 'Config Global', icon: Settings2 },
  { id: 'logs', label: 'Logs', icon: ScrollText },
]

export function SuperAgentPage() {
  const [activeTab, setActiveTab] = useState<Tab>('agents')

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Bot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Super Agente IA</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Agentes autônomos que atendem leads pelo WhatsApp 24/7
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
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 dark:bg-purple-400 rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {activeTab === 'agents' && <AgentsList />}
      {activeTab === 'models' && <AgentModels />}
      {activeTab === 'config' && <AgentConfigGlobal />}
      {activeTab === 'logs' && <AgentLogs />}
    </div>
  )
}
