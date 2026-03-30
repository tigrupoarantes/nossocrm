'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, User, DollarSign, MessageSquare, LayoutDashboard, Bot, Megaphone, BookOpen, Settings, Link2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'

interface SearchResult {
  id: string
  type: 'contact' | 'deal' | 'page'
  title: string
  subtitle?: string
  href: string
  icon: React.ElementType
}

const QUICK_LINKS: SearchResult[] = [
  { id: 'dash', type: 'page', title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { id: 'conv', type: 'page', title: 'Conversas', href: '/conversations', icon: MessageSquare },
  { id: 'agent', type: 'page', title: 'Super Agente', href: '/super-agent', icon: Bot },
  { id: 'ads', type: 'page', title: 'Anúncios', href: '/ads', icon: Megaphone },
  { id: 'conn', type: 'page', title: 'Conexões', href: '/connections', icon: Link2 },
  { id: 'help', type: 'page', title: 'Ajuda', href: '/help', icon: BookOpen },
  { id: 'settings', type: 'page', title: 'Configurações', href: '/settings', icon: Settings },
]

function useGlobalSearch(query: string, orgId: string | undefined) {
  return useQuery({
    queryKey: ['global-search', query, orgId],
    queryFn: async (): Promise<SearchResult[]> => {
      if (!query.trim() || query.length < 2) return []

      const [contactsRes, dealsRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, first_name, last_name, phone, email')
          .eq('organization_id', orgId!)
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(5),
        supabase
          .from('deals')
          .select('id, title, value')
          .eq('organization_id', orgId!)
          .ilike('title', `%${query}%`)
          .limit(5),
      ])

      const results: SearchResult[] = []

      for (const contact of (contactsRes.data ?? [])) {
        const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Contato'
        results.push({
          id: contact.id,
          type: 'contact',
          title: name,
          subtitle: contact.phone ?? contact.email ?? undefined,
          href: `/contacts?id=${contact.id}`,
          icon: User,
        })
      }

      for (const deal of (dealsRes.data ?? [])) {
        results.push({
          id: deal.id,
          type: 'deal',
          title: deal.title,
          subtitle: deal.value ? `R$ ${Number(deal.value).toLocaleString('pt-BR')}` : undefined,
          href: `/boards?deal=${deal.id}`,
          icon: DollarSign,
        })
      }

      return results
    },
    enabled: !!orgId && query.length >= 2,
  })
}

export function GlobalSearch() {
  const { organizationId } = useAuth()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: results = [] } = useGlobalSearch(query, organizationId ?? undefined)

  const quickLinks = QUICK_LINKS.filter((l) =>
    !query.trim() || l.title.toLowerCase().includes(query.toLowerCase())
  )

  // Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
    }
  }, [open])

  const navigate = useCallback((href: string) => {
    setOpen(false)
    router.push(href)
  }, [router])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-white/20 transition-colors text-sm"
        title="Busca global (Ctrl+K)"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="hidden sm:inline text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 px-1.5 py-0.5 rounded font-mono">
          ⌘K
        </kbd>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-white/10">
          <Search className="h-5 w-5 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar contatos, deals, páginas..."
            className="flex-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none text-sm"
          />
          <button type="button" onClick={() => setOpen(false)}>
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto py-2">
          {/* Quick links */}
          {query.length < 2 && (
            <div>
              <p className="px-4 py-1 text-xs font-medium text-slate-400 uppercase tracking-wider">Páginas</p>
              {quickLinks.map((link) => {
                const Icon = link.icon
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => navigate(link.href)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left"
                  >
                    <Icon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{link.title}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Search results */}
          {query.length >= 2 && (
            <>
              {results.length > 0 ? (
                <>
                  <p className="px-4 py-1 text-xs font-medium text-slate-400 uppercase tracking-wider">Resultados</p>
                  {results.map((result) => {
                    const Icon = result.icon
                    return (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => navigate(result.href)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left"
                      >
                        <div className="flex-shrink-0 w-8 h-8 bg-slate-100 dark:bg-white/10 rounded-lg flex items-center justify-center">
                          <Icon className="h-4 w-4 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{result.title}</p>
                          {result.subtitle && (
                            <p className="text-xs text-slate-500">{result.subtitle}</p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-slate-500 text-sm">Nenhum resultado para "{query}"</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 dark:border-white/5 text-xs text-slate-400 flex items-center gap-3">
          <span><kbd className="font-mono bg-slate-100 dark:bg-white/10 px-1 rounded">↑↓</kbd> navegar</span>
          <span><kbd className="font-mono bg-slate-100 dark:bg-white/10 px-1 rounded">↵</kbd> abrir</span>
          <span><kbd className="font-mono bg-slate-100 dark:bg-white/10 px-1 rounded">Esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  )
}
