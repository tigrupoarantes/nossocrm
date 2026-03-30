'use client'

import React, { useState } from 'react'
import { Send, History, Loader2 } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useOptionalToast } from '@/context/ToastContext'
import { TemplateEditor } from './components/TemplateEditor'
import { AudienceSelector, type AudienceFilter } from './components/AudienceSelector'
import { DispatchMonitor } from './components/DispatchMonitor'

type TabId = 'create' | 'history'

export function MassDispatchPage() {
  const { addToast } = useOptionalToast()
  const [activeTab, setActiveTab] = useState<TabId>('create')
  const [name, setName] = useState(`Disparo ${new Date().toLocaleDateString('pt-BR')}`)
  const [template, setTemplate] = useState('')
  const [delaySeconds, setDelaySeconds] = useState(120)
  const [audience, setAudience] = useState<AudienceFilter>({ tags: [], allContacts: false })

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/dispatch/mass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          messageTemplate: template,
          targetFilter: audience,
          delaySeconds,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Erro ao iniciar disparo')
      }
      return res.json()
    },
    onSuccess: (data) => {
      addToast?.(`Disparo iniciado para ${data.totalRecipients} contatos!`, 'success')
      setTemplate('')
      setActiveTab('history')
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  const canDispatch = template.trim().length > 0 && (audience.allContacts || audience.tags.length > 0)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 rounded-xl">
            <Send className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Disparo em Massa</h1>
            <p className="text-sm text-slate-500">Envie mensagens para múltiplos contatos com delay</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-2xl w-fit">
          {[
            { id: 'create' as TabId, label: 'Novo disparo', icon: Send },
            { id: 'history' as TabId, label: 'Histórico', icon: History },
          ].map((tab) => {
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
                {tab.label}
              </button>
            )
          })}
        </div>

        {activeTab === 'create' && (
          <div className="space-y-5">
            {/* Aviso */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                ⚠️ Use com responsabilidade. Muitos disparos em sequência podem resultar em bloqueio do número no WhatsApp.
                Recomendamos um delay mínimo de 60 segundos entre envios.
              </p>
            </div>

            {/* Nome do disparo */}
            <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Nome do disparo
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Promoção de Novembro"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Audiência */}
            <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
              <AudienceSelector value={audience} onChange={setAudience} />
            </div>

            {/* Mensagem */}
            <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
              <TemplateEditor value={template} onChange={setTemplate} />
            </div>

            {/* Delay */}
            <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Delay entre envios: {delaySeconds}s ({Math.floor(delaySeconds / 60)}min {delaySeconds % 60}s)
              </label>
              <input
                type="range"
                min={30}
                max={600}
                step={10}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>30s (mínimo)</span>
                <span>10min (máximo)</span>
              </div>
            </div>

            {/* Botão de disparo */}
            <button
              type="button"
              onClick={() => dispatchMutation.mutate()}
              disabled={!canDispatch || dispatchMutation.isPending || !name.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {dispatchMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Iniciando disparo...</>
                : <><Send className="h-4 w-4" /> Iniciar Disparo</>
              }
            </button>
          </div>
        )}

        {activeTab === 'history' && <DispatchMonitor />}
      </div>
    </div>
  )
}
