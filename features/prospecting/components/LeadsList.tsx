'use client'

import React, { useState } from 'react'
import { ChevronLeft, Send, Phone, MapPin, Star, MessageSquare, Loader2 } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useOptionalToast } from '@/context/ToastContext'

interface Lead {
  businessName: string
  phone: string | null
  address: string | null
  rating: number | null
}

interface Props {
  leads: Lead[]
  campaignId: string
  onBack: () => void
  onDispatch?: () => void
}

export function LeadsList({ leads, campaignId, onBack, onDispatch }: Props) {
  const { addToast } = useOptionalToast()
  const [messageTemplate, setMessageTemplate] = useState(
    'Olá! Somos a {empresa} e gostaríamos de apresentar nossos serviços para {nome}. Podemos conversar? 😊'
  )
  const [delaySeconds, setDelaySeconds] = useState(120)
  const [showDispatchForm, setShowDispatchForm] = useState(false)

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/prospecting/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, messageTemplate, delaySeconds }),
      })
      if (!res.ok) throw new Error('Erro ao iniciar disparo')
      return res.json()
    },
    onSuccess: () => {
      addToast?.(`Disparo iniciado para ${leads.length} leads!`, 'success')
      onDispatch?.()
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">{leads.length} leads encontrados</h2>
          <p className="text-xs text-slate-500">Pronto para disparar mensagens</p>
        </div>
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setShowDispatchForm(!showDispatchForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Send className="h-4 w-4" />
            Disparar mensagens
          </button>
        </div>
      </div>

      {/* Formulário de disparo */}
      {showDispatchForm && (
        <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-4 space-y-4">
          <h3 className="font-semibold text-blue-900 dark:text-blue-200">Configurar Disparo</h3>
          <div>
            <label className="block text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
              Mensagem template
            </label>
            <textarea
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-black/20 border border-blue-300 dark:border-blue-500/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Variáveis: {'{'}nome{'}'}, {'{'}empresa{'}'}, {'{'}cidade{'}'}, {'{'}segmento{'}'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
              Delay entre envios: {delaySeconds}s
            </label>
            <input
              type="range"
              min={10}
              max={300}
              step={10}
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <button
            type="button"
            onClick={() => dispatchMutation.mutate()}
            disabled={dispatchMutation.isPending || !messageTemplate.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {dispatchMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Iniciando...</>
              : <><Send className="h-4 w-4" /> Confirmar Disparo</>
            }
          </button>
        </div>
      )}

      {/* Lista de leads */}
      <div className="space-y-2">
        {leads.map((lead, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 px-4 py-3 border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 rounded-xl"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-sm font-bold text-blue-600">
              {lead.businessName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{lead.businessName}</p>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                {lead.phone && (
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>
                )}
                {lead.address && (
                  <span className="flex items-center gap-1 truncate max-w-48"><MapPin className="h-3 w-3 flex-shrink-0" />{lead.address}</span>
                )}
              </div>
            </div>
            {lead.rating && (
              <span className="flex items-center gap-1 text-xs text-amber-500">
                <Star className="h-3 w-3 fill-amber-400" />{lead.rating}
              </span>
            )}
            {lead.phone ? (
              <span className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                Com tel.
              </span>
            ) : (
              <span className="text-xs text-slate-400 bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-full">
                Sem tel.
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
