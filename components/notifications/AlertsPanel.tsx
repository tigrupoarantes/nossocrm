'use client'

import React, { useState, useEffect } from 'react'
import { Bell, X, CheckCheck, AlertCircle, Info, CheckCircle2, Zap, Users, DollarSign } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  read_at: string | null
  created_at: string
  metadata: Record<string, unknown>
}

const TYPE_META: Record<string, { icon: React.ElementType; color: string }> = {
  deal_won: { icon: DollarSign, color: 'text-emerald-600' },
  deal_lost: { icon: AlertCircle, color: 'text-red-500' },
  deal_stagnant: { icon: AlertCircle, color: 'text-amber-500' },
  new_message: { icon: Zap, color: 'text-blue-600' },
  activity_due: { icon: CheckCircle2, color: 'text-purple-600' },
  new_lead: { icon: Users, color: 'text-blue-500' },
  info: { icon: Info, color: 'text-slate-500' },
  agent_event: { icon: Zap, color: 'text-purple-500' },
}

interface Props {
  variant?: 'button' | 'inline'
}

export function AlertsPanel({ variant = 'button' }: Props) {
  const { organizationId, user } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: notifications = [] } = useQuery({
    queryKey: ['alerts-panel', user?.id],
    queryFn: async (): Promise<Notification[]> => {
      const { data } = await supabase
        .from('system_notifications')
        .select('id, type, title, body, read_at, created_at, metadata')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(30)

      return data ?? []
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  })

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel('alerts-panel-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'system_notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['alerts-panel'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user?.id, queryClient])

  const unreadCount = notifications.filter((n) => !n.read_at).length

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await supabase
        .from('system_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user!.id)
        .is('read_at', null)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts-panel'] }),
  })

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('system_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts-panel'] }),
  })

  const content = (
    <div className="w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Alertas
          {unreadCount > 0 && (
            <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
              {unreadCount}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllReadMutation.mutate()}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas lidas
            </button>
          )}
          {variant === 'button' && (
            <button type="button" onClick={() => setOpen(false)}>
              <X className="h-4 w-4 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="text-center py-10">
            <Bell className="h-7 w-7 mx-auto mb-2 text-slate-300" />
            <p className="text-slate-500 text-sm">Nenhum alerta ainda.</p>
          </div>
        ) : (
          notifications.map((notif) => {
            const meta = TYPE_META[notif.type ?? 'info'] ?? TYPE_META.info
            const Icon = meta.icon
            return (
              <button
                key={notif.id}
                type="button"
                onClick={() => !notif.read_at && markReadMutation.mutate(notif.id)}
                className={`w-full flex items-start gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-0 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${
                  !notif.read_at ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                }`}
              >
                <div className={`flex-shrink-0 mt-0.5 p-1.5 rounded-lg ${notif.read_at ? 'bg-slate-100 dark:bg-white/10' : 'bg-blue-50 dark:bg-blue-900/20'}`}>
                  <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${notif.read_at ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
                    {notif.title}
                  </p>
                  {notif.body && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notif.body}</p>
                  )}
                  <time className="text-xs text-slate-400 mt-1 block">
                    {new Date(notif.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </time>
                </div>
                {!notif.read_at && (
                  <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1.5" />
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )

  if (variant === 'inline') return content

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
        title="Alertas"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-bold border-2 border-white dark:border-slate-900">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50">
            {content}
          </div>
        </>
      )}
    </div>
  )
}
