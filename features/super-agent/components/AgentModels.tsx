'use client'

import React, { useState } from 'react'
import { LayoutTemplate, Plus, Loader2, Check } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useOptionalToast } from '@/context/ToastContext'

interface Model {
  id: string
  name: string
  description: string | null
  category: string | null
  base_prompt: string
  is_template: boolean
}

const CATEGORY_COLORS: Record<string, string> = {
  vendas: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  suporte: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  agendamento: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  qualificacao: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

async function fetchModels(orgId: string): Promise<Model[]> {
  const { data } = await supabase
    .from('super_agent_models')
    .select('id, name, description, category, base_prompt, is_template')
    .or(`is_template.eq.true,organization_id.eq.${orgId}`)
    .order('is_template', { ascending: false })
  return data ?? []
}

export function AgentModels() {
  const { organizationId } = useAuth()
  const { addToast } = useOptionalToast()
  const queryClient = useQueryClient()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: models = [], isLoading } = useQuery({
    queryKey: ['super-agent-models', organizationId],
    queryFn: () => fetchModels(organizationId!),
    enabled: !!organizationId,
  })

  const useModelMutation = useMutation({
    mutationFn: async (model: Model) => {
      const { error } = await supabase.from('super_agents').insert({
        organization_id: organizationId,
        name: model.name,
        description: model.description,
        system_prompt: model.base_prompt,
        model: 'gemini-3-flash-preview',
        provider: 'google',
        is_active: false,
        config: {},
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-agents'] })
      addToast?.('Agente criado a partir do modelo! Edite antes de ativar.', 'success')
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  return (
    <div>
      <p className="text-sm text-slate-500 mb-4">
        Use um modelo pré-configurado como ponto de partida para seu agente.
      </p>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {models.map((model) => (
            <div
              key={model.id}
              className="border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-900 dark:text-white">{model.name}</h3>
                    {model.category && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[model.category] ?? 'bg-slate-100 text-slate-600'}`}>
                        {model.category}
                      </span>
                    )}
                    {model.is_template && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 font-medium">
                        Template
                      </span>
                    )}
                  </div>
                  {model.description && (
                    <p className="text-xs text-slate-500">{model.description}</p>
                  )}
                </div>
              </div>

              {/* Prompt preview */}
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === model.id ? null : model.id)}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
              >
                {expandedId === model.id ? 'Ocultar prompt' : 'Ver prompt'}
              </button>

              {expandedId === model.id && (
                <div className="bg-slate-50 dark:bg-black/20 rounded-xl p-3 text-xs text-slate-600 dark:text-slate-400 max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {model.base_prompt}
                </div>
              )}

              <button
                type="button"
                onClick={() => useModelMutation.mutate(model)}
                disabled={useModelMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {useModelMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Plus className="h-3.5 w-3.5" />
                }
                Usar este modelo
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
