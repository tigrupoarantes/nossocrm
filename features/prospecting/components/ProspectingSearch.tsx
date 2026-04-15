'use client'

import React, { useState } from 'react'
import { Search, MapPin, Tag, Loader2, ChevronRight } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useOptionalToast } from '@/context/ToastContext'
import { LeadsList } from './LeadsList'

interface SearchResult {
  campaignId: string
  totalLeads: number
  leadsWithPhone?: number
  leadsWithoutPhone?: number
  leads: Array<{
    businessName: string
    phone: string | null
    address: string | null
    rating: number | null
  }>
}

const SEGMENTS = [
  'Restaurantes', 'Academias', 'Clínicas', 'Salões de beleza', 'Advogados',
  'Contabilidade', 'Dentistas', 'Farmácias', 'Lojas de roupas', 'Supermercados',
  'Mecânicas', 'Imobiliárias', 'Escolas', 'Hotéis', 'Padarias',
]

export function ProspectingSearch() {
  const { addToast } = useOptionalToast()
  const [segment, setSegment] = useState('')
  const [city, setCity] = useState('')
  const [maxResults, setMaxResults] = useState(20)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [showDispatch, setShowDispatch] = useState(false)

  const searchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/prospecting/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment, city, maxResults }),
      })
      if (!res.ok) throw new Error('Erro na busca')
      return res.json() as Promise<SearchResult>
    },
    onSuccess: (data) => {
      setResult(data)
      const withPhone = data.leadsWithPhone ?? data.leads.filter((l) => l.phone).length
      if (withPhone === 0 && data.totalLeads > 0) {
        addToast?.(
          `${data.totalLeads} leads encontrados, mas nenhum com telefone. Verifique se a Places API (Details) está habilitada no Google Cloud.`,
          'warning'
        )
      } else {
        addToast?.(
          `${data.totalLeads} leads encontrados — ${withPhone} com telefone, ${data.totalLeads - withPhone} sem.`,
          'success'
        )
      }
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  if (result && !showDispatch) {
    return (
      <LeadsList
        leads={result.leads}
        campaignId={result.campaignId}
        onBack={() => setResult(null)}
        onDispatch={() => setShowDispatch(true)}
      />
    )
  }

  return (
    <div className="max-w-xl">
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            <Tag className="inline h-4 w-4 mr-1" /> Segmento de negócio *
          </label>
          <div className="relative">
            <input
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              placeholder="Ex: Restaurantes, Academias, Clínicas..."
              list="segments-list"
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
            />
            <datalist id="segments-list">
              {SEGMENTS.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            <MapPin className="inline h-4 w-4 mr-1" /> Cidade *
          </label>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Ex: São Paulo, Campinas, Rio de Janeiro..."
            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Máximo de resultados: {maxResults}
          </label>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>5</span>
            <span>100</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => searchMutation.mutate()}
          disabled={!segment.trim() || !city.trim() || searchMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {searchMutation.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Buscando leads...</>
            : <><Search className="h-4 w-4" /> Buscar Leads</>
          }
        </button>
      </div>

      {/* Dica */}
      <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          💡 <strong>Dica:</strong> Use segmentos específicos para melhores resultados.
          Ex: "Salões de beleza" em vez de "Beleza".
        </p>
      </div>
    </div>
  )
}
