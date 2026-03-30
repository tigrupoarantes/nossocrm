'use client'

import React from 'react'
import { Zap, CheckCircle2, XCircle, Clock, ExternalLink, Code } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

const EVENT_TYPE_META: Record<string, { label: string; color: string }> = {
  lead: { label: 'Lead', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
  purchase: { label: 'Compra', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
  view_content: { label: 'Visualização', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' },
  add_to_cart: { label: 'Carrinho', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
}

const SOURCE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  capi: { label: 'CAPI', icon: Zap, color: 'text-purple-600' },
  pixel: { label: 'Pixel', icon: Code, color: 'text-blue-600' },
  form: { label: 'Formulário', icon: ExternalLink, color: 'text-emerald-600' },
  manual: { label: 'Manual', icon: CheckCircle2, color: 'text-slate-600' },
}

export function AdsTracking() {
  const { organizationId } = useAuth()

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['ad-lead-events', organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ad_lead_events')
        .select('id, event_type, source, event_data, created_at, campaign_id')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })
        .limit(50)

      return data ?? []
    },
    enabled: !!organizationId,
    refetchInterval: 30_000,
  })

  const { data: adAccounts = [] } = useQuery({
    queryKey: ['ad-accounts', organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ad_accounts')
        .select('id, platform, account_name, is_active, last_sync_at')
        .eq('organization_id', organizationId!)

      return data ?? []
    },
    enabled: !!organizationId,
  })

  return (
    <div className="space-y-6">
      {/* Status das conexões */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Contas Conectadas</h3>

        {adAccounts.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-500 text-sm mb-3">Nenhuma conta de anúncios conectada.</p>
            <a
              href="/connections"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Conectar conta
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {adAccounts.map((account) => (
              <div key={account.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
                <div className={`w-2 h-2 rounded-full ${account.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {account.account_name ?? 'Conta sem nome'}
                  </p>
                  <p className="text-xs text-slate-500 capitalize">{account.platform}</p>
                </div>
                <div className="text-right text-xs text-slate-400">
                  {account.last_sync_at
                    ? `Sync: ${new Date(account.last_sync_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
                    : 'Nunca sincronizado'
                  }
                </div>
                {account.is_active
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  : <XCircle className="h-4 w-4 text-slate-400" />
                }
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Eventos de rastreamento */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900 dark:text-white">Eventos Recentes</h3>
          <span className="text-xs text-slate-400">Últimos 50 eventos</span>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-100 dark:bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-10">
            <Clock className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="text-slate-500 text-sm">Nenhum evento registrado ainda.</p>
            <p className="text-xs text-slate-400 mt-1">
              Eventos CAPI são enviados automaticamente quando deals são ganhos.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {events.map((event) => {
              const typeMeta = EVENT_TYPE_META[event.event_type ?? ''] ?? { label: event.event_type ?? 'Evento', color: 'text-slate-600 bg-slate-100 dark:bg-white/10' }
              const sourceMeta = SOURCE_META[event.source ?? 'manual'] ?? SOURCE_META.manual
              const SourceIcon = sourceMeta.icon

              return (
                <div
                  key={event.id}
                  className="flex items-center gap-3 p-3 border border-slate-100 dark:border-white/10 rounded-xl"
                >
                  <SourceIcon className={`h-4 w-4 flex-shrink-0 ${sourceMeta.color}`} />
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeMeta.color}`}>
                    {typeMeta.label}
                  </span>
                  <span className="text-xs text-slate-500">{sourceMeta.label}</span>
                  <div className="flex-1 min-w-0 text-xs text-slate-400 truncate">
                    {event.event_data?.lead_id
                      ? `Lead: ${event.event_data.lead_id}`
                      : event.event_data?.leadgen_id
                        ? `FB Lead: ${event.event_data.leadgen_id}`
                        : '—'
                    }
                  </div>
                  <time className="text-xs text-slate-400 flex-shrink-0">
                    {new Date(event.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </time>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Instruções de configuração */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-5">
        <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Conversions API (CAPI)
        </h3>
        <div className="space-y-2 text-sm text-blue-800 dark:text-blue-300">
          <p>O NossoCRM envia eventos CAPI automaticamente quando:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Um deal é marcado como <strong>ganho</strong> → evento <code className="bg-blue-100 dark:bg-blue-800/30 px-1 rounded">Purchase</code></li>
            <li>Um contato é criado via formulário → evento <code className="bg-blue-100 dark:bg-blue-800/30 px-1 rounded">Lead</code></li>
            <li>Um agendamento é confirmado → evento <code className="bg-blue-100 dark:bg-blue-800/30 px-1 rounded">Schedule</code></li>
          </ul>
          <p className="mt-3">
            Configure o Pixel ID e Token de Acesso em{' '}
            <a href="/settings" className="underline font-medium">
              Configurações → Facebook CAPI
            </a>.
          </p>
        </div>
      </div>
    </div>
  )
}
