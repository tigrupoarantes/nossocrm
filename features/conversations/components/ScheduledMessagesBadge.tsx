'use client'

import React, { useState } from 'react'
import { Calendar, X, Clock, Trash2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useOptionalToast } from '@/context/ToastContext'

interface Props {
  conversationId?: string
  dealId?: string
}

interface ScheduledMessage {
  id: string
  phone: string
  body: string
  scheduled_at: string
  status: string
  channel: string
}

export function ScheduledMessagesBadge({ conversationId, dealId }: Props) {
  const { addToast } = useOptionalToast()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const params = new URLSearchParams()
  if (conversationId) params.set('conversationId', conversationId)
  if (dealId) params.set('dealId', dealId)

  const { data: messages = [] } = useQuery({
    queryKey: ['scheduled-messages', conversationId, dealId],
    queryFn: async (): Promise<ScheduledMessage[]> => {
      const res = await fetch(`/api/messages/scheduled?${params}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.messages ?? []
    },
    enabled: !!(conversationId || dealId),
    refetchInterval: 60_000,
  })

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/messages/scheduled?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erro ao cancelar')
    },
    onSuccess: () => {
      addToast?.('Mensagem cancelada.', 'success')
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] })
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  if (messages.length === 0) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-medium rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
      >
        <Calendar className="h-3.5 w-3.5" />
        {messages.length} agendada{messages.length > 1 ? 's' : ''}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                Mensagens Agendadas
              </h3>
              <button type="button" onClick={() => setOpen(false)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto">
              {messages.map((msg) => (
                <div key={msg.id} className="p-4 border-b border-slate-100 dark:border-white/5 last:border-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(msg.scheduled_at).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => cancelMutation.mutate(msg.id)}
                      disabled={cancelMutation.isPending}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                    {msg.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
