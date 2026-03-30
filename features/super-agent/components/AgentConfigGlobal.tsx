'use client'

import React, { useState } from 'react'
import { Settings2, Save, Loader2, Info } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useOptionalToast } from '@/context/ToastContext'

interface GlobalConfig {
  maxDailyDispatch: number
  responseDelayMin: number
  responseDelayMax: number
  skipGroupMessages: boolean
  skipStatusMessages: boolean
  activeSessionOnly: boolean
}

const DEFAULT_CONFIG: GlobalConfig = {
  maxDailyDispatch: 200,
  responseDelayMin: 1,
  responseDelayMax: 4,
  skipGroupMessages: true,
  skipStatusMessages: true,
  activeSessionOnly: false,
}

export function AgentConfigGlobal() {
  const { organizationId } = useAuth()
  const { addToast } = useOptionalToast()
  const [config, setConfig] = useState<GlobalConfig>(DEFAULT_CONFIG)

  useQuery({
    queryKey: ['super-agent-global-config', organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('organization_settings')
        .select('super_agent_config')
        .eq('organization_id', organizationId)
        .single()
      const cfg = (data as Record<string, unknown>)?.super_agent_config as GlobalConfig | null
      if (cfg) setConfig({ ...DEFAULT_CONFIG, ...cfg })
      return cfg
    },
    enabled: !!organizationId,
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('organization_settings')
        .update({ super_agent_config: config })
        .eq('organization_id', organizationId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => addToast?.('Configuração global salva!', 'success'),
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  const set = <K extends keyof GlobalConfig>(key: K, value: GlobalConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }))

  return (
    <div className="max-w-xl space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4 flex gap-3">
        <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Estas configurações se aplicam a todos os Super Agentes da organização.
        </p>
      </div>

      {/* Limites */}
      <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold text-slate-900 dark:text-white">Limites Globais</h3>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Máximo de respostas por dia
          </label>
          <input
            type="number"
            min={1}
            max={10000}
            value={config.maxDailyDispatch}
            onChange={(e) => set('maxDailyDispatch', Number(e.target.value))}
            className="w-full max-w-xs px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Delay de resposta (segundos)
          </label>
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">Mínimo</p>
              <input
                type="number"
                min={0}
                max={60}
                value={config.responseDelayMin}
                onChange={(e) => set('responseDelayMin', Number(e.target.value))}
                className="w-20 px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <span className="text-slate-400 mt-4">até</span>
            <div>
              <p className="text-xs text-slate-400 mb-1">Máximo</p>
              <input
                type="number"
                min={0}
                max={120}
                value={config.responseDelayMax}
                onChange={(e) => set('responseDelayMax', Number(e.target.value))}
                className="w-20 px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <span className="text-sm text-slate-400 mt-4">seg</span>
          </div>
        </div>
      </section>

      {/* Filtros */}
      <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold text-slate-900 dark:text-white">Filtros de Mensagem</h3>

        {[
          { key: 'skipGroupMessages' as const, label: 'Ignorar mensagens de grupos', desc: 'O agente não responde em grupos do WhatsApp' },
          { key: 'skipStatusMessages' as const, label: 'Ignorar stories/status', desc: 'Não responder reações a stories' },
          { key: 'activeSessionOnly' as const, label: 'Apenas sessão ativa', desc: 'Agente só atende conversas não atribuídas' },
        ].map(({ key, label, desc }) => (
          <div key={key} className="flex items-start gap-3">
            <label className="relative inline-flex items-center cursor-pointer mt-0.5">
              <input
                type="checkbox"
                checked={config[key]}
                onChange={(e) => set(key, e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600" />
            </label>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
              <p className="text-xs text-slate-500">{desc}</p>
            </div>
          </div>
        ))}
      </section>

      <button
        type="button"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
      >
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar configuração global
      </button>
    </div>
  )
}
