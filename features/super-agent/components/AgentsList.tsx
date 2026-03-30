'use client'

import React, { useState } from 'react'
import { Bot, Plus, Power, PowerOff, Pencil, Loader2, Zap } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { AgentEditor } from './AgentEditor'

interface Agent {
  id: string
  name: string
  description: string | null
  model: string
  provider: string
  is_active: boolean
  department_id: string | null
  created_at: string
}

async function fetchAgents(orgId: string): Promise<Agent[]> {
  const { data } = await supabase
    .from('super_agents')
    .select('id, name, description, model, provider, is_active, department_id, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export function AgentsList() {
  const { organizationId } = useAuth()
  const queryClient = useQueryClient()
  const [editingAgent, setEditingAgent] = useState<Agent | null | 'new'>(null)

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['super-agents', organizationId],
    queryFn: () => fetchAgents(organizationId!),
    enabled: !!organizationId,
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('super_agents')
        .update({ is_active: active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', organizationId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['super-agents'] }),
  })

  if (editingAgent !== null) {
    return (
      <AgentEditor
        agent={editingAgent === 'new' ? null : editingAgent}
        onClose={() => setEditingAgent(null)}
        onSaved={() => {
          setEditingAgent(null)
          queryClient.invalidateQueries({ queryKey: ['super-agents'] })
        }}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          {agents.length} agente{agents.length !== 1 && 's'} configurado{agents.length !== 1 && 's'}
        </p>
        <button
          type="button"
          onClick={() => setEditingAgent('new')}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo Agente
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
          <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bot className="h-8 w-8 text-purple-500" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Nenhum agente criado</h3>
          <p className="text-sm text-slate-500 mb-4">
            Crie seu primeiro Super Agente e comece a atender leads 24/7.
          </p>
          <button
            type="button"
            onClick={() => setEditingAgent('new')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Criar primeiro agente
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`flex items-center gap-4 p-4 rounded-2xl border transition-colors ${
                agent.is_active
                  ? 'border-purple-200 dark:border-purple-500/20 bg-purple-50/30 dark:bg-purple-500/5'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 opacity-60'
              }`}
            >
              {/* Ícone */}
              <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                agent.is_active ? 'bg-purple-500/20' : 'bg-slate-100 dark:bg-white/10'
              }`}>
                <Bot className={`h-5 w-5 ${agent.is_active ? 'text-purple-600' : 'text-slate-400'}`} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-white">{agent.name}</h3>
                  {agent.is_active && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Ativo
                    </span>
                  )}
                </div>
                {agent.description && (
                  <p className="text-sm text-slate-500 truncate mt-0.5">{agent.description}</p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">{agent.model}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingAgent(agent)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleMutation.mutate({ id: agent.id, active: !agent.is_active })}
                  disabled={toggleMutation.isPending}
                  className={`p-2 rounded-xl transition-colors ${
                    agent.is_active
                      ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                      : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
                  }`}
                  aria-label={agent.is_active ? 'Desativar' : 'Ativar'}
                >
                  {toggleMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : agent.is_active
                    ? <Power className="h-4 w-4" />
                    : <PowerOff className="h-4 w-4" />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
