'use client'

/**
 * DepartmentsSettings — gerenciamento de departamentos nas Configurações.
 */
import React, { useState } from 'react'
import { Layers, Plus, Pencil, Check, X, Trash2, Circle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useOptionalToast } from '@/context/ToastContext'
import { SettingsSection } from './SettingsSection'

const PRESET_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
]

interface Department {
  id: string
  name: string
  description: string | null
  color: string
  is_active: boolean
}

async function fetchDepartments(organizationId: string): Promise<Department[]> {
  const { data } = await supabase
    .from('departments')
    .select('id, name, description, color, is_active')
    .eq('organization_id', organizationId)
    .order('name')
  return data ?? []
}

export function DepartmentsSettings() {
  const { organizationId } = useAuth()
  const { addToast } = useOptionalToast()
  const queryClient = useQueryClient()

  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [editForm, setEditForm] = useState<{ name: string; description: string; color: string }>({
    name: '',
    description: '',
    color: PRESET_COLORS[0],
  })

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments', organizationId],
    queryFn: () => fetchDepartments(organizationId!),
    enabled: !!organizationId,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('departments').insert({
        organization_id: organizationId,
        name: newName.trim(),
        description: newDesc.trim() || null,
        color: newColor,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      setCreating(false)
      setNewName('')
      setNewDesc('')
      setNewColor(PRESET_COLORS[0])
      addToast?.('Departamento criado!', 'success')
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('departments')
        .update({
          name: editForm.name.trim(),
          description: editForm.description.trim() || null,
          color: editForm.color,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('organization_id', organizationId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      setEditingId(null)
      addToast?.('Departamento atualizado!', 'success')
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('departments')
        .update({ is_active: active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', organizationId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departments'] }),
  })

  const startEdit = (dept: Department) => {
    setEditingId(dept.id)
    setEditForm({ name: dept.name, description: dept.description ?? '', color: dept.color })
  }

  return (
    <SettingsSection title="Departamentos" icon={Layers}>
      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 bg-slate-100 dark:bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {departments.map((dept) =>
              editingId === dept.id ? (
                <div
                  key={dept.id}
                  className="border border-primary-500/40 bg-primary-50/30 dark:bg-primary-900/10 rounded-xl p-4 space-y-3"
                >
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Nome do departamento"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <input
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Descrição (opcional)"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <div className="flex gap-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditForm((f) => ({ ...f, color: c }))}
                        className={`w-6 h-6 rounded-full transition-transform ${editForm.color === c ? 'scale-125 ring-2 ring-offset-2 ring-slate-400' : ''}`}
                        style={{ backgroundColor: c }}
                        aria-label={`Cor ${c}`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateMutation.mutate(dept.id)}
                      disabled={!editForm.name.trim() || updateMutation.isPending}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" /> Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={dept.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                    dept.is_active
                      ? 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/5'
                      : 'border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/2 opacity-50'
                  }`}
                >
                  <Circle className="h-3 w-3 flex-shrink-0" style={{ color: dept.color, fill: dept.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{dept.name}</p>
                    {dept.description && (
                      <p className="text-xs text-slate-500 truncate">{dept.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(dept)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleMutation.mutate({ id: dept.id, active: !dept.is_active })}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                      aria-label={dept.is_active ? 'Desativar' : 'Ativar'}
                    >
                      {dept.is_active ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 text-emerald-500" />}
                    </button>
                  </div>
                </div>
              )
            )}

            {departments.length === 0 && !creating && (
              <div className="text-center py-8 text-slate-400">
                <Layers className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum departamento criado ainda.</p>
              </div>
            )}
          </>
        )}

        {/* Form de criação */}
        {creating ? (
          <div className="border border-dashed border-primary-500/40 rounded-xl p-4 space-y-3">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome do departamento *"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Descrição (opcional)"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="flex gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-offset-2 ring-slate-400' : ''}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={!newName.trim() || createMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                <Check className="h-3.5 w-3.5" /> Criar
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setNewName(''); setNewDesc('') }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Novo departamento
          </button>
        )}
      </div>
    </SettingsSection>
  )
}
