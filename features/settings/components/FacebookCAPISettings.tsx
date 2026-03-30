'use client'

import React, { useState, useEffect } from 'react'
import { Zap, Save, Eye, EyeOff, Loader2, CheckCircle2, ExternalLink } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useOptionalToast } from '@/context/ToastContext'

interface CAPIConfig {
  pixelId: string
  accessToken: string
  testEventCode: string
  enabled: boolean
}

export function FacebookCAPISettings() {
  const { organizationId } = useAuth()
  const { addToast } = useOptionalToast()
  const queryClient = useQueryClient()
  const [showToken, setShowToken] = useState(false)
  const [form, setForm] = useState<CAPIConfig>({
    pixelId: '',
    accessToken: '',
    testEventCode: '',
    enabled: false,
  })

  const { data: settings, isLoading } = useQuery({
    queryKey: ['facebook-capi-settings', organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('organization_settings')
        .select('facebook_capi_config')
        .eq('organization_id', organizationId!)
        .maybeSingle()

      return (data?.facebook_capi_config as CAPIConfig | null) ?? null
    },
    enabled: !!organizationId,
  })

  useEffect(() => {
    if (settings) {
      setForm({
        pixelId: settings.pixelId ?? '',
        accessToken: settings.accessToken ?? '',
        testEventCode: settings.testEventCode ?? '',
        enabled: settings.enabled ?? false,
      })
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: async (config: CAPIConfig) => {
      const { error } = await supabase
        .from('organization_settings')
        .upsert(
          {
            organization_id: organizationId,
            facebook_capi_config: config,
          },
          { onConflict: 'organization_id' }
        )

      if (error) throw error
    },
    onSuccess: () => {
      addToast?.('Configurações Facebook CAPI salvas!', 'success')
      queryClient.invalidateQueries({ queryKey: ['facebook-capi-settings'] })
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ads/capi/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pixelId: form.pixelId, accessToken: form.accessToken, testEventCode: form.testEventCode }),
      })
      if (!res.ok) throw new Error('Falha no teste')
      return res.json()
    },
    onSuccess: () => addToast?.('Evento de teste enviado! Verifique o Events Manager do Facebook.', 'success'),
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  if (isLoading) {
    return <div className="h-48 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />
  }

  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          A <strong>Conversions API (CAPI)</strong> envia eventos de conversão diretamente do servidor,
          sem depender do pixel do navegador. Isso melhora a atribuição e reduz a perda de dados por bloqueadores.
        </p>
        <a
          href="https://business.facebook.com/events_manager"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2"
        >
          Abrir Events Manager <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Toggle habilitado */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl">
        <div>
          <p className="font-medium text-slate-900 dark:text-white">Habilitar CAPI</p>
          <p className="text-sm text-slate-500">Ativar envio automático de eventos server-side</p>
        </div>
        <button
          type="button"
          onClick={() => setForm((p) => ({ ...p, enabled: !p.enabled }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            form.enabled ? 'bg-blue-600' : 'bg-slate-200 dark:bg-white/20'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              form.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Configurações */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Pixel ID
          </label>
          <input
            type="text"
            value={form.pixelId}
            onChange={(e) => setForm((p) => ({ ...p, pixelId: e.target.value }))}
            placeholder="123456789012345"
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-400 mt-1">Encontrado em Events Manager → Seu Pixel → Configurações</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Token de Acesso
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={form.accessToken}
              onChange={(e) => setForm((p) => ({ ...p, accessToken: e.target.value }))}
              placeholder="EAAxxxxxxxxxx..."
              className="w-full px-3 py-2 pr-10 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">Token de acesso do sistema gerado no Events Manager</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Código de Evento de Teste <span className="text-slate-400">(opcional)</span>
          </label>
          <input
            type="text"
            value={form.testEventCode}
            onChange={(e) => setForm((p) => ({ ...p, testEventCode: e.target.value }))}
            placeholder="TEST12345"
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-400 mt-1">Use para testar sem afetar dados de produção</p>
        </div>
      </div>

      {/* Eventos enviados automaticamente */}
      <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 space-y-2">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Eventos enviados automaticamente</h4>
        <div className="space-y-1">
          {[
            { event: 'Purchase', trigger: 'Deal marcado como ganho' },
            { event: 'Lead', trigger: 'Novo contato criado via formulário/webhook' },
            { event: 'Contact', trigger: 'Nova conversa iniciada no WhatsApp' },
            { event: 'Schedule', trigger: 'Agendamento confirmado em atividade' },
          ].map((item) => (
            <div key={item.event} className="flex items-center gap-3 text-xs">
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded font-mono">
                {item.event}
              </span>
              <span className="text-slate-500">{item.trigger}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Ações */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending || !form.pixelId || !form.accessToken}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saveMutation.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            : saveMutation.isSuccess
              ? <><CheckCircle2 className="h-4 w-4" /> Salvo!</>
              : <><Save className="h-4 w-4" /> Salvar configurações</>
          }
        </button>

        <button
          type="button"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending || !form.pixelId || !form.accessToken}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          {testMutation.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Testando...</>
            : <><Zap className="h-4 w-4" /> Enviar evento de teste</>
          }
        </button>
      </div>
    </div>
  )
}
