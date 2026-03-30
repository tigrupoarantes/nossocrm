'use client'

import React, { useState } from 'react'
import { Send, Users, Filter, Loader2, MessageSquare } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useOptionalToast } from '@/context/ToastContext'

export function DirectDispatch() {
  const { organizationId } = useAuth()
  const { addToast } = useOptionalToast()
  const [tagFilter, setTagFilter] = useState('')
  const [messageTemplate, setMessageTemplate] = useState('')
  const [delaySeconds, setDelaySeconds] = useState(120)
  const [previewCount, setPreviewCount] = useState<number | null>(null)

  // Buscar tags disponíveis
  const { data: tags = [] } = useQuery({
    queryKey: ['available-tags', organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('tags')
        .eq('organization_id', organizationId!)
        .not('tags', 'is', null)
      const allTags = (data ?? []).flatMap((c) => c.tags ?? [])
      return [...new Set(allTags)].sort()
    },
    enabled: !!organizationId,
  })

  // Pré-visualizar quantidade de contatos
  const previewMutation = useMutation({
    mutationFn: async () => {
      let query = supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId!)
        .not('phone', 'is', null)

      if (tagFilter) {
        query = query.contains('tags', [tagFilter])
      }

      const { count } = await query
      setPreviewCount(count ?? 0)
      return count
    },
  })

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      // Buscar contatos que atendem ao filtro
      let query = supabase
        .from('contacts')
        .select('id, first_name, last_name, phone')
        .eq('organization_id', organizationId!)
        .not('phone', 'is', null)
        .limit(500)

      if (tagFilter) {
        query = query.contains('tags', [tagFilter])
      }

      const { data: contacts } = await query
      if (!contacts || contacts.length === 0) throw new Error('Nenhum contato com telefone encontrado')

      // Criar campanha de disparo direto
      const { data: campaign, error } = await supabase
        .from('prospecting_campaigns')
        .insert({
          organization_id: organizationId,
          name: `Disparo Direto ${new Date().toLocaleDateString('pt-BR')}`,
          segment: tagFilter || 'Todos os contatos',
          status: 'running',
          total_leads: contacts.length,
        })
        .select('id')
        .single()

      if (error || !campaign) throw new Error('Erro ao criar campanha')

      // Criar leads da campanha
      const leads = contacts.map((c) => ({
        campaign_id: campaign.id,
        organization_id: organizationId,
        business_name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Contato',
        phone: c.phone,
        contact_id: c.id,
        source: 'manual',
        status: 'new',
      }))

      await supabase.from('prospecting_leads').insert(leads)

      // Iniciar disparo
      const res = await fetch('/api/prospecting/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id, messageTemplate, delaySeconds }),
      })
      if (!res.ok) throw new Error('Erro ao iniciar disparo')
      return contacts.length
    },
    onSuccess: (count) => {
      addToast?.(`Disparo iniciado para ${count} contatos!`, 'success')
      setMessageTemplate('')
      setPreviewCount(null)
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  return (
    <div className="max-w-xl space-y-5">
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4">
        <p className="text-sm text-amber-700 dark:text-amber-300">
          ⚠️ <strong>Disparo Direto</strong> envia mensagens para contatos existentes no CRM.
          Use com responsabilidade para não ser bloqueado pelo WhatsApp.
        </p>
      </div>

      {/* Filtro de audiência */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Filter className="h-4 w-4" /> Audiência
        </h3>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Filtrar por tag (opcional)
          </label>
          <select
            value={tagFilter}
            onChange={(e) => { setTagFilter(e.target.value); setPreviewCount(null) }}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos os contatos com telefone</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => previewMutation.mutate()}
          disabled={previewMutation.isPending}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors"
        >
          <Users className="h-4 w-4" />
          {previewMutation.isPending ? 'Calculando...' : 'Pré-visualizar audiência'}
        </button>

        {previewCount !== null && (
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            → {previewCount} contato{previewCount !== 1 && 's'} serão impactados
          </p>
        )}
      </div>

      {/* Mensagem */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Mensagem
        </h3>

        <div>
          <textarea
            value={messageTemplate}
            onChange={(e) => setMessageTemplate(e.target.value)}
            rows={5}
            placeholder="Olá {nome}! Temos uma novidade especial para você..."
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
          <p className="text-xs text-slate-400 mt-1">
            Variáveis: {'{'}nome{'}'}, {'{'}empresa{'}'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Delay entre envios: {delaySeconds}s ({Math.floor(delaySeconds / 60)}min {delaySeconds % 60}s)
          </label>
          <input
            type="range"
            min={30}
            max={300}
            step={10}
            value={delaySeconds}
            onChange={(e) => setDelaySeconds(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => dispatchMutation.mutate()}
        disabled={!messageTemplate.trim() || dispatchMutation.isPending}
        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {dispatchMutation.isPending
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Iniciando disparo...</>
          : <><Send className="h-4 w-4" /> Iniciar Disparo</>
        }
      </button>
    </div>
  )
}
