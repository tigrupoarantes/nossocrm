'use client'

/**
 * NotificationCenter — painel flutuante de alertas (como botão "Alertas" da PUBLIX).
 * Unifica system_notifications + notificações de deals/atividades.
 */
import React, { useRef, useState, useEffect } from 'react'
import { Bell, Check, CheckCheck, Clock, X, TrendingUp, MessageCircle, Activity, Bot, Search, Megaphone } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import Link from 'next/link'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  action_link: string | null
  read_at: string | null
  created_at: string
}

async function fetchNotifications(userId: string, orgId: string): Promise<Notification[]> {
  const { data } = await supabase
    .from('system_notifications')
    .select('id, type, title, message, action_link, read_at, created_at')
    .eq('organization_id', orgId)
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order('created_at', { ascending: false })
    .limit(30)
  return data ?? []
}

function getTimeAgo(dateStr: string) {
  const diffSecs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diffSecs < 60) return 'agora mesmo'
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)} min`
  if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)} h`
  return `${Math.floor(diffSecs / 86400)} d`
}

function getEventIcon(type: string) {
  const map: Record<string, React.ElementType> = {
    SYSTEM_SUCCESS: TrendingUp,
    deal_won: TrendingUp,
    new_message: MessageCircle,
    activity_due: Activity,
    activity_overdue: Activity,
    agent_event: Bot,
    agent_handoff: Bot,
    prospecting_complete: Search,
    dispatch_complete: Megaphone,
  }
  const Icon = map[type] ?? Bell
  return <Icon className="h-4 w-4" />
}

function getIconBg(type: string) {
  if (type.includes('SUCCESS') || type === 'deal_won' || type === 'prospecting_complete') return 'bg-emerald-500/10 text-emerald-600'
  if (type.includes('ALERT') || type === 'activity_overdue') return 'bg-red-500/10 text-red-500'
  if (type.includes('WARNING') || type === 'activity_due' || type === 'agent_handoff') return 'bg-amber-500/10 text-amber-600'
  if (type === 'new_message') return 'bg-blue-500/10 text-blue-600'
  if (type === 'agent_event') return 'bg-purple-500/10 text-purple-600'
  return 'bg-slate-100 dark:bg-white/10 text-slate-500'
}

interface Props {
  /** Variante: 'button' = botão flutuante, 'inline' = inline no layout */
  variant?: 'button' | 'inline'
}

export function NotificationCenter({ variant = 'button' }: Props) {
  const { user, organizationId } = useAuth()
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications-center', user?.id, organizationId],
    queryFn: () => fetchNotifications(user!.id, organizationId!),
    enabled: !!user?.id && !!organizationId,
    refetchInterval: 30_000,
  })

  const unreadCount = notifications.filter((n) => !n.read_at).length

  // Realtime subscription
  useEffect(() => {
    if (!organizationId) return
    const channel = supabase
      .channel('notifications-center')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'system_notifications',
        filter: `organization_id=eq.${organizationId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications-center'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [organizationId, queryClient])

  // Fechar ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('system_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications-center'] }),
  })

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await supabase
        .from('system_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .is('read_at', null)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications-center'] }),
  })

  const trigger = (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      aria-expanded={isOpen}
      aria-label={`Alertas: ${unreadCount} não lidos`}
      className="relative flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
    >
      <Bell className="h-4 w-4" aria-hidden="true" />
      <span>Alertas</span>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )

  const panel = isOpen && (
    <div
      className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
      role="dialog"
      aria-label="Central de Alertas"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary-500" />
          <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Alertas</h3>
          {unreadCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 font-medium">
              {unreadCount} novo{unreadCount !== 1 && 's'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllReadMutation.mutate()}
              className="p-1.5 text-slate-400 hover:text-primary-600 rounded-lg transition-colors"
              title="Marcar todas como lidas"
            >
              <CheckCheck className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="max-h-[60vh] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="py-12 flex flex-col items-center text-slate-400">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3">
              <Check className="h-6 w-6 text-emerald-500" />
            </div>
            <p className="font-medium text-slate-700 dark:text-white text-sm">Tudo limpo!</p>
            <p className="text-xs mt-1">Nenhum alerta no momento.</p>
          </div>
        ) : (
          <ul>
            {notifications.map((n) => (
              <li key={n.id} className={n.read_at ? 'opacity-50' : ''}>
                <Link
                  href={n.action_link || '#'}
                  onClick={() => { markReadMutation.mutate(n.id); setIsOpen(false) }}
                  className="flex gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group border-b border-slate-50 dark:border-white/5 last:border-0"
                >
                  <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${getIconBg(n.type)}`}>
                    {getEventIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900 dark:text-white line-clamp-1">
                        {n.title}
                      </p>
                      {!n.read_at && <span className="w-2 h-2 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {getTimeAgo(n.created_at)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )

  return (
    <div className="relative" ref={ref}>
      {trigger}
      {panel}
    </div>
  )
}
