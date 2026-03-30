'use client'

/**
 * NotificationPreferences — configuração de notificações por evento.
 * Permite ao usuário escolher quais eventos receber e por quais canais.
 */
import React, { useState } from 'react'
import { Bell, BellOff, Smartphone, Mail, MonitorSmartphone, Save, Loader2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useOptionalToast } from '@/context/ToastContext'
import { SettingsSection } from './SettingsSection'
import {
  EVENT_TYPE_LABELS,
  type NotificationEventType,
  type NotificationChannel,
} from '@/lib/notifications/engine'

type NotificationEvent = NotificationEventType
const NOTIFICATION_EVENTS = Object.keys(EVENT_TYPE_LABELS) as NotificationEventType[]

const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, { label: string; description: string; group: string }> = {
  new_deal: { label: 'Nova negociação', description: 'Quando uma nova negociação é criada', group: 'CRM' },
  deal_won: { label: 'Negociação ganha', description: 'Quando uma negociação é marcada como ganha', group: 'CRM' },
  deal_lost: { label: 'Negociação perdida', description: 'Quando uma negociação é marcada como perdida', group: 'CRM' },
  deal_stagnant: { label: 'Negociação parada', description: 'Quando uma negociação fica sem atividade', group: 'CRM' },
  new_message: { label: 'Nova mensagem', description: 'Quando uma nova mensagem é recebida', group: 'Mensagens' },
  activity_due: { label: 'Atividade próxima', description: 'Quando uma atividade está próxima do vencimento', group: 'Atividades' },
  activity_overdue: { label: 'Atividade atrasada', description: 'Quando uma atividade está atrasada', group: 'Atividades' },
  agent_event: { label: 'Evento do agente IA', description: 'Quando o Super Agente processa uma mensagem', group: 'Agente IA' },
  agent_handoff: { label: 'Transferência do agente', description: 'Quando o agente transfere para um humano', group: 'Agente IA' },
  prospecting_complete: { label: 'Prospecção concluída', description: 'Quando uma busca de prospecção termina', group: 'Prospecção' },
  dispatch_complete: { label: 'Disparo concluído', description: 'Quando um disparo em massa é concluído', group: 'Prospecção' },
  new_lead: { label: 'Novo lead', description: 'Quando um novo lead é capturado', group: 'Prospecção' },
  new_submission: { label: 'Nova submissão', description: 'Quando uma landing page recebe uma submissão', group: 'Prospecção' },
}

type PrefMap = Record<NotificationEvent, { channels: NotificationChannel[]; isEnabled: boolean }>

async function fetchPrefs(userId: string, orgId: string): Promise<PrefMap> {
  const { data } = await supabase
    .from('notification_preferences')
    .select('event_type, channels, is_enabled')
    .eq('user_id', userId)
    .eq('organization_id', orgId)

  const map = {} as PrefMap
  for (const event of NOTIFICATION_EVENTS) {
    const found = (data ?? []).find((r) => r.event_type === event)
    map[event] = found
      ? { channels: found.channels as NotificationChannel[], isEnabled: found.is_enabled }
      : { channels: ['in_app'], isEnabled: true }
  }
  return map
}

const CHANNEL_META: Record<NotificationChannel, { label: string; icon: React.ElementType }> = {
  in_app: { label: 'App', icon: MonitorSmartphone },
  push: { label: 'Push', icon: Smartphone },
  email: { label: 'E-mail', icon: Mail },
}

const CHANNELS: NotificationChannel[] = ['in_app', 'push']

export function NotificationPreferences() {
  const { user, organizationId } = useAuth()
  const { addToast } = useOptionalToast()
  const queryClient = useQueryClient()
  const [prefs, setPrefs] = useState<PrefMap | null>(null)

  const { isLoading } = useQuery({
    queryKey: ['notification-prefs', user?.id, organizationId],
    queryFn: () => fetchPrefs(user!.id, organizationId!),
    enabled: !!user?.id && !!organizationId,
    onSuccess: (data) => setPrefs(data),
  } as Parameters<typeof useQuery>[0])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!prefs || !user?.id || !organizationId) return
      const upserts = NOTIFICATION_EVENTS.map((event) => ({
        user_id: user.id,
        organization_id: organizationId,
        event_type: event,
        channels: prefs[event].channels,
        is_enabled: prefs[event].isEnabled,
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(upserts, { onConflict: 'user_id,organization_id,event_type' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-prefs'] })
      addToast?.('Preferências salvas!', 'success')
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  const toggleEvent = (event: NotificationEvent) => {
    setPrefs((prev) => {
      if (!prev) return prev
      return { ...prev, [event]: { ...prev[event], isEnabled: !prev[event].isEnabled } }
    })
  }

  const toggleChannel = (event: NotificationEvent, channel: NotificationChannel) => {
    setPrefs((prev) => {
      if (!prev) return prev
      const channels = prev[event].channels
      const updated = channels.includes(channel)
        ? channels.filter((c) => c !== channel)
        : [...channels, channel]
      // in_app sempre obrigatório
      if (!updated.includes('in_app')) updated.push('in_app')
      return { ...prev, [event]: { ...prev[event], channels: updated } }
    })
  }

  // Agrupar por grupo
  const groups = [...new Set(NOTIFICATION_EVENTS.map((e) => NOTIFICATION_EVENT_LABELS[e].group))]

  return (
    <SettingsSection title="Notificações" icon={Bell}>
      <div className="mt-6 space-y-6">
        {isLoading || !prefs ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-slate-100 dark:bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {groups.map((group) => (
              <div key={group}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{group}</h4>
                <div className="space-y-1">
                  {NOTIFICATION_EVENTS.filter((e) => NOTIFICATION_EVENT_LABELS[e].group === group).map((event) => {
                    const pref = prefs[event]
                    const meta = NOTIFICATION_EVENT_LABELS[event]
                    return (
                      <div
                        key={event}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                          pref.isEnabled
                            ? 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5'
                            : 'border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-transparent opacity-60'
                        }`}
                      >
                        {/* Toggle habilitado */}
                        <button
                          type="button"
                          onClick={() => toggleEvent(event)}
                          className="flex-shrink-0"
                          aria-label={pref.isEnabled ? 'Desativar' : 'Ativar'}
                        >
                          {pref.isEnabled
                            ? <Bell className="h-4 w-4 text-primary-500" />
                            : <BellOff className="h-4 w-4 text-slate-400" />
                          }
                        </button>

                        {/* Label */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{meta.label}</p>
                          <p className="text-xs text-slate-500 truncate">{meta.description}</p>
                        </div>

                        {/* Canais */}
                        {pref.isEnabled && (
                          <div className="flex gap-1.5">
                            {CHANNELS.map((ch) => {
                              const { label, icon: Icon } = CHANNEL_META[ch]
                              const active = pref.channels.includes(ch)
                              const disabled = ch === 'in_app' // sempre ativo
                              return (
                                <button
                                  key={ch}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => toggleChannel(event, ch)}
                                  title={label}
                                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                                    active
                                      ? 'bg-primary-500/10 border-primary-500/30 text-primary-700 dark:text-primary-300'
                                      : 'border-slate-200 dark:border-white/10 text-slate-400 hover:border-slate-300'
                                  } ${disabled ? 'cursor-default' : ''}`}
                                >
                                  <Icon className="h-3 w-3" />
                                  <span className="hidden sm:inline">{label}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-xl hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {saveMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Save className="h-4 w-4" />
                }
                Salvar preferências
              </button>
            </div>
          </>
        )}
      </div>
    </SettingsSection>
  )
}
