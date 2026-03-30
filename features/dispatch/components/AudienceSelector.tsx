'use client'

import React, { useState } from 'react'
import { Users, Tag, Filter } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

export interface AudienceFilter {
  tags: string[]
  allContacts: boolean
}

interface Props {
  value: AudienceFilter
  onChange: (filter: AudienceFilter) => void
}

export function AudienceSelector({ value, onChange }: Props) {
  const { organizationId } = useAuth()
  const [previewCount, setPreviewCount] = useState<number | null>(null)

  const { data: availableTags = [] } = useQuery({
    queryKey: ['available-tags', organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('tags')
        .eq('organization_id', organizationId!)
        .not('tags', 'is', null)
      const allTags = (data ?? []).flatMap((c) => c.tags ?? [])
      return [...new Set(allTags)].sort() as string[]
    },
    enabled: !!organizationId,
  })

  const previewMutation = useMutation({
    mutationFn: async () => {
      let query = supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId!)
        .not('phone', 'is', null)

      if (!value.allContacts && value.tags.length > 0) {
        query = query.overlaps('tags', value.tags)
      }

      const { count } = await query
      setPreviewCount(count ?? 0)
      return count
    },
  })

  const toggleTag = (tag: string) => {
    const newTags = value.tags.includes(tag)
      ? value.tags.filter((t) => t !== tag)
      : [...value.tags, tag]
    onChange({ ...value, tags: newTags, allContacts: newTags.length === 0 && value.allContacts })
    setPreviewCount(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-slate-400" />
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300">Audiência</h4>
      </div>

      {/* Toggle todos os contatos */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={value.allContacts}
          onChange={(e) => {
            onChange({ allContacts: e.target.checked, tags: [] })
            setPreviewCount(null)
          }}
          className="w-4 h-4 rounded border-slate-300 text-blue-600"
        />
        <span className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Todos os contatos com telefone
        </span>
      </label>

      {/* Filtro por tags */}
      {!value.allContacts && (
        <div>
          <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
            <Tag className="h-3 w-3" />
            Filtrar por tags (selecione uma ou mais):
          </p>
          {availableTags.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Nenhuma tag encontrada nos contatos.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    value.tags.includes(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pré-visualizar audiência */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => previewMutation.mutate()}
          disabled={previewMutation.isPending || (!value.allContacts && value.tags.length === 0)}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-40 transition-colors"
        >
          <Users className="h-4 w-4" />
          {previewMutation.isPending ? 'Calculando...' : 'Ver total de contatos'}
        </button>

        {previewCount !== null && (
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            → {previewCount} contato{previewCount !== 1 && 's'}
          </span>
        )}
      </div>
    </div>
  )
}
