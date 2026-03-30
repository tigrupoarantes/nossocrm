'use client'

import React, { useState } from 'react'
import { Link2, Smartphone, Megaphone, CheckCircle2, XCircle, QrCode, RefreshCw, Loader2, ExternalLink } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useOptionalToast } from '@/context/ToastContext'
import { buildFacebookOAuthUrl } from '@/lib/ads/facebook'

type TabId = 'whatsapp' | 'ads'

function WhatsAppConnectionTab() {
  const { organizationId } = useAuth()
  const { addToast } = useOptionalToast()
  const queryClient = useQueryClient()

  const { data: instances = [], isLoading } = useQuery({
    queryKey: ['whatsapp-instances', organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, status, phone_number, waha_api_url')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })

      return data ?? []
    },
    enabled: !!organizationId,
    refetchInterval: 15_000,
  })

  const connectMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const instance = instances.find((i) => i.id === instanceId)
      if (!instance?.waha_api_url) throw new Error('URL da API WAHA não configurada')

      const res = await fetch(
        `${instance.waha_api_url}/api/${instance.instance_name}/auth/qr?format=json`
      )
      if (!res.ok) throw new Error('Erro ao buscar QR Code')
      return res.json()
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  if (isLoading) {
    return <div className="h-32 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />
  }

  if (instances.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
        <Smartphone className="h-10 w-10 mx-auto mb-3 text-slate-300" />
        <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Nenhuma instância WhatsApp configurada</p>
        <p className="text-sm text-slate-500 mb-4">
          Configure a instância WAHA nas Configurações para conectar seu WhatsApp.
        </p>
        <a
          href="/settings"
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition-colors"
        >
          Ir para Configurações
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {instances.map((instance) => {
        const isConnected = instance.status === 'WORKING'

        return (
          <div key={instance.id} className="border border-slate-200 dark:border-white/10 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${isConnected ? 'bg-green-500/10' : 'bg-slate-100 dark:bg-white/10'}`}>
                  <Smartphone className={`h-5 w-5 ${isConnected ? 'text-green-600' : 'text-slate-400'}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{instance.instance_name}</h3>
                  {instance.phone_number && (
                    <p className="text-sm text-slate-500">{instance.phone_number}</p>
                  )}
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium ${
                isConnected
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              }`}>
                {isConnected
                  ? <><CheckCircle2 className="h-3.5 w-3.5" /> Conectado</>
                  : <><XCircle className="h-3.5 w-3.5" /> Desconectado</>
                }
              </span>
            </div>

            {!isConnected && (
              <div>
                <button
                  type="button"
                  onClick={() => connectMutation.mutate(instance.id)}
                  disabled={connectMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {connectMutation.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Buscando QR...</>
                    : <><QrCode className="h-4 w-4" /> Conectar via QR Code</>
                  }
                </button>
              </div>
            )}

            {isConnected && (
              <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-3">
                <p className="text-xs text-green-700 dark:text-green-300">
                  ✓ WhatsApp conectado e pronto para uso. O Super Agente está ativo para esta instância.
                </p>
              </div>
            )}
          </div>
        )
      })}

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          💡 O NossoCRM usa <strong>WAHA (WhatsApp HTTP API)</strong> para conectar o WhatsApp.
          Para adicionar novas instâncias, acesse{' '}
          <a href="/settings" className="underline">Configurações → WhatsApp</a>.
        </p>
      </div>
    </div>
  )
}

function AdsConnectionTab() {
  const { organizationId } = useAuth()
  const { addToast } = useOptionalToast()
  const queryClient = useQueryClient()

  const { data: adAccounts = [], isLoading } = useQuery({
    queryKey: ['ad-accounts-connections', organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ad_accounts')
        .select('id, platform, account_name, account_id, is_active, last_sync_at')
        .eq('organization_id', organizationId!)
        .order('created_at', { ascending: false })

      return data ?? []
    },
    enabled: !!organizationId,
  })

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ad_accounts')
        .update({ is_active: false })
        .eq('id', id)
        .eq('organization_id', organizationId!)
      if (error) throw error
    },
    onSuccess: () => {
      addToast?.('Conta desconectada.', 'success')
      queryClient.invalidateQueries({ queryKey: ['ad-accounts-connections'] })
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  const handleConnectFacebook = () => {
    const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID
    if (!appId) {
      addToast?.('Facebook App ID não configurado.', 'error')
      return
    }
    const redirectUri = `${window.location.origin}/api/ads/facebook/callback`
    const state = crypto.randomUUID()
    const url = buildFacebookOAuthUrl(appId, redirectUri, state)
    window.location.href = url
  }

  return (
    <div className="space-y-5">
      {/* Botão de conectar */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">f</span>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Facebook Ads</h3>
            <p className="text-sm text-slate-500">Conecte sua conta de anúncios para sincronizar campanhas</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleConnectFacebook}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Conectar com Facebook
        </button>
      </div>

      {/* Contas conectadas */}
      {isLoading ? (
        <div className="h-24 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />
      ) : adAccounts.length > 0 ? (
        <div className="space-y-3">
          <h4 className="font-medium text-slate-700 dark:text-slate-300">Contas conectadas</h4>
          {adAccounts.map((account) => (
            <div key={account.id} className="flex items-center gap-3 p-4 border border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-white/5">
              <div className={`w-2 h-2 rounded-full ${account.is_active ? 'bg-green-500' : 'bg-slate-400'}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {account.account_name ?? 'Conta sem nome'}
                </p>
                <p className="text-xs text-slate-500 capitalize">
                  {account.platform} · ID: {account.account_id}
                </p>
              </div>
              {account.last_sync_at && (
                <p className="text-xs text-slate-400">
                  Sync: {new Date(account.last_sync_at).toLocaleDateString('pt-BR')}
                </p>
              )}
              {account.is_active && (
                <button
                  type="button"
                  onClick={() => disconnectMutation.mutate(account.id)}
                  disabled={disconnectMutation.isPending}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Desconectar
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
          <Megaphone className="h-8 w-8 mx-auto mb-2 text-slate-300" />
          <p className="text-slate-500 text-sm">Nenhuma conta de anúncios conectada.</p>
        </div>
      )}

      {/* Outras plataformas (futuro) */}
      <div className="border border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-5">
        <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-3">Em breve</h4>
        <div className="flex gap-3">
          {['Google Ads', 'TikTok Ads'].map((platform) => (
            <div key={platform} className="px-3 py-2 bg-slate-50 dark:bg-white/5 rounded-xl text-sm text-slate-400">
              {platform}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ConnectionsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('whatsapp')

  const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'whatsapp', label: 'WhatsApp', icon: Smartphone },
    { id: 'ads', label: 'Anúncios', icon: Megaphone },
  ]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-700 rounded-xl">
            <Link2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Conexões</h1>
            <p className="text-sm text-slate-500">Gerencie integrações com WhatsApp e plataformas de anúncios</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-2xl w-fit">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {activeTab === 'whatsapp' && <WhatsAppConnectionTab />}
        {activeTab === 'ads' && <AdsConnectionTab />}
      </div>
    </div>
  )
}
