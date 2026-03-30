'use client'

import React, { useState } from 'react'
import { Calendar, X, Clock, Send, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useOptionalToast } from '@/context/ToastContext'

interface Props {
  conversationId?: string
  dealId?: string
  contactId?: string
  phone: string
  contactName?: string
  onClose: () => void
}

export function ScheduleMessageModal({ conversationId, dealId, contactId, phone, contactName, onClose }: Props) {
  const { addToast } = useOptionalToast()
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')

  // Default: amanhã às 09:00
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)

  const [scheduledAt, setScheduledAt] = useState(
    tomorrow.toISOString().slice(0, 16)  // YYYY-MM-DDTHH:mm
  )

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/messages/scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          dealId,
          contactId,
          phone,
          body,
          scheduledAt: new Date(scheduledAt).toISOString(),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Erro ao agendar mensagem')
      }
      return res.json()
    },
    onSuccess: () => {
      addToast?.('Mensagem agendada com sucesso!', 'success')
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] })
      onClose()
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  const now = new Date()
  const selectedDate = new Date(scheduledAt)
  const isInPast = selectedDate <= now

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-xl">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Agendar Mensagem</h2>
              {contactName && (
                <p className="text-xs text-slate-500">Para: {contactName} ({phone})</p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Data e hora do envio
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {isInPast && (
              <p className="text-xs text-red-500 mt-1">⚠️ Selecione uma data futura</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Mensagem
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Digite a mensagem que será enviada..."
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <p className="text-xs text-slate-400 text-right mt-1">{body.length} caracteres</p>
          </div>

          {scheduledAt && !isInPast && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
              <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                Envio agendado para{' '}
                <strong>
                  {new Date(scheduledAt).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })}
                </strong>
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-slate-200 dark:border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => scheduleMutation.mutate()}
            disabled={!body.trim() || isInPast || scheduleMutation.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {scheduleMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Agendando...</>
              : <><Send className="h-4 w-4" /> Agendar</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
