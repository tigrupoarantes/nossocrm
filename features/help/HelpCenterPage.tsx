'use client'

import React, { useState } from 'react'
import { BookOpen, Search, Tag, Eye, ChevronRight, ArrowLeft } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

interface Article {
  id: string
  title: string
  slug: string
  content_md: string
  category: string
  tags: string[]
  views_count: number
}

const CATEGORY_META: Record<string, { label: string; emoji: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', emoji: '💬', color: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-500/30' },
  crm: { label: 'CRM & Pipeline', emoji: '📊', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30' },
  ia: { label: 'Inteligência Artificial', emoji: '🤖', color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30' },
  prospecting: { label: 'Prospecção', emoji: '🎯', color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30' },
  ads: { label: 'Anúncios', emoji: '📢', color: 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30' },
  general: { label: 'Geral', emoji: '📖', color: 'bg-slate-50 dark:bg-slate-900/20 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-500/30' },
}

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-slate-800 dark:text-slate-200 mt-5 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold text-slate-900 dark:text-white mt-6 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-slate-900 dark:text-white mb-4">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono text-slate-800 dark:text-slate-200">$1</code>')
    .replace(/```[\s\S]*?```/g, (match) => {
      const code = match.replace(/```\w*\n?/g, '').replace(/```/g, '')
      return `<pre class="bg-slate-900 text-slate-100 p-4 rounded-xl overflow-x-auto my-3 text-sm font-mono">${code}</pre>`
    })
    .replace(/^- (.+)$/gm, '<li class="flex gap-2 text-slate-700 dark:text-slate-300 text-sm mb-1"><span>•</span><span>$1</span></li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="flex gap-2 text-slate-700 dark:text-slate-300 text-sm mb-1"><span class="text-slate-400">$1.</span><span>$2</span></li>')
    .replace(/\n\n/g, '<br /><br />')
}

export function HelpCenterPage() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['help-articles'],
    queryFn: async (): Promise<Article[]> => {
      const { data } = await supabase
        .from('help_articles')
        .select('id, title, slug, content_md, category, tags, views_count')
        .eq('is_published', true)
        .order('views_count', { ascending: false })

      return data ?? []
    },
  })

  const viewMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.rpc('increment_article_views', { article_id: id }).maybeSingle()
    },
  })

  const openArticle = (article: Article) => {
    setSelectedArticle(article)
    viewMutation.mutate(article.id)
  }

  const categories = ['all', ...Object.keys(CATEGORY_META)]

  const filtered = articles.filter((a) => {
    const matchSearch = !search.trim() ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
    const matchCategory = categoryFilter === 'all' || a.category === categoryFilter
    return matchSearch && matchCategory
  })

  if (selectedArticle) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <button
            type="button"
            onClick={() => setSelectedArticle(null)}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para artigos
          </button>

          <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
            {/* Categoria */}
            {CATEGORY_META[selectedArticle.category] && (
              <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium border mb-4 ${CATEGORY_META[selectedArticle.category].color}`}>
                {CATEGORY_META[selectedArticle.category].emoji}
                {CATEGORY_META[selectedArticle.category].label}
              </span>
            )}

            {/* Conteúdo */}
            <div
              className="prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedArticle.content_md) }}
            />

            {/* Tags */}
            {selectedArticle.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-slate-200 dark:border-white/10">
                <Tag className="h-4 w-4 text-slate-400 mt-0.5" />
                {selectedArticle.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-slate-100 dark:bg-white/10 text-slate-500 px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1 mt-4 text-xs text-slate-400">
              <Eye className="h-3.5 w-3.5" />
              {selectedArticle.views_count + 1} visualizações
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="text-center py-6">
          <div className="inline-flex p-3 bg-blue-600 rounded-2xl mb-4">
            <BookOpen className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Central de Ajuda</h1>
          <p className="text-slate-500">Encontre respostas e aprenda a usar o NossoCRM</p>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-4 top-3 h-5 w-5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar artigos..."
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        {/* Filtro de categorias */}
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => {
            const meta = CATEGORY_META[cat]
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  categoryFilter === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                {meta ? `${meta.emoji} ${meta.label}` : 'Todos'}
              </button>
            )
          })}
        </div>

        {/* Lista de artigos */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="text-slate-500">Nenhum artigo encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map((article) => {
              const meta = CATEGORY_META[article.category] ?? CATEGORY_META.general
              return (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => openArticle(article)}
                  className="text-left bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 hover:border-blue-300 dark:hover:border-blue-500/50 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${meta.color}`}>
                      {meta.emoji} {meta.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 transition-colors flex-shrink-0 mt-0.5" />
                  </div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2 leading-snug">
                    {article.title}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {article.views_count}
                    </span>
                    {article.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
