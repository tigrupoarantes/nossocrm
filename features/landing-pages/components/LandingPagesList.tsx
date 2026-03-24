'use client';

import React from 'react';
import Link from 'next/link';
import { Plus, Globe, FileText, Trash2, Eye, Users, Loader2, EyeOff } from 'lucide-react';
import { useLandingPages, useDeleteLandingPage, useUnpublishLandingPage } from '../hooks/useLandingPages';
import type { LandingPage, LandingPageStatus } from '@/types';

const STATUS_LABELS: Record<LandingPageStatus, { label: string; color: string }> = {
  draft: { label: 'Rascunho', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  published: { label: 'Publicada', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  archived: { label: 'Arquivada', color: 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400' },
};

// Card interno — instancia hooks por LP para mutations individuais
function LandingPageCard({ lp, lpBaseUrl }: { lp: LandingPage; lpBaseUrl: string }) {
  const deleteMutation = useDeleteLandingPage();
  const unpublishMutation = useUnpublishLandingPage(lp.id!);

  const status = (lp.status ?? 'draft') as LandingPageStatus;
  const badge = STATUS_LABELS[status];

  return (
    <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow group">
      {/* Preview thumbnail placeholder */}
      <div className="h-32 bg-gradient-to-br from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20 flex items-center justify-center border-b border-slate-100 dark:border-white/5">
        <FileText size={32} className="text-primary-300 dark:text-primary-700" />
      </div>

      <div className="p-4 space-y-3">
        {/* Título + badge */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm leading-snug line-clamp-2">
            {lp.title}
          </h3>
          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
            {badge.label}
          </span>
        </div>

        {/* Slug */}
        <p className="text-xs text-slate-400 font-mono truncate">
          {lpBaseUrl}/{lp.slug}
        </p>

        {/* Métricas */}
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <Eye size={12} />
            {lp.viewsCount ?? 0} views
          </span>
          <span className="flex items-center gap-1">
            <Users size={12} />
            {lp.submissionsCount ?? 0} leads
          </span>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2 pt-1">
          <Link
            href={`/landing-pages/${lp.id}`}
            className="flex-1 text-center text-xs font-medium px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            Editar
          </Link>

          {status === 'published' && (
            <a
              href={`${lpBaseUrl}/${lp.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            >
              Ver
            </a>
          )}

          {status === 'published' && (
            <button
              onClick={() => {
                if (confirm('Despublicar esta landing page? Ela voltará para rascunho.')) {
                  unpublishMutation.mutate();
                }
              }}
              disabled={unpublishMutation.isPending}
              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
              title="Despublicar"
            >
              {unpublishMutation.isPending
                ? <Loader2 size={13} className="animate-spin" />
                : <EyeOff size={13} />}
            </button>
          )}

          <button
            onClick={() => {
              if (confirm('Excluir permanentemente esta landing page? Essa ação não pode ser desfeita.')) {
                deleteMutation.mutate(lp.id!);
              }
            }}
            disabled={deleteMutation.isPending}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
            title="Excluir permanentemente"
          >
            {deleteMutation.isPending
              ? <Loader2 size={13} className="animate-spin" />
              : <Trash2 size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LandingPagesList() {
  const { data, isLoading } = useLandingPages();

  const lpBaseUrl = process.env.NEXT_PUBLIC_LP_BASE_URL ?? '/p';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const pages = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display">Landing Pages</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Crie páginas de captura com IA e publique em segundos.
          </p>
        </div>
        <Link
          href="/landing-pages/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium text-sm transition-colors shadow-sm"
        >
          <Plus size={16} />
          Nova Landing Page
        </Link>
      </div>

      {/* Empty state */}
      {pages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mb-4">
            <Globe size={32} className="text-primary-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Nenhuma landing page ainda</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-xs">
            Descreva sua página para a IA e ela gera um HTML profissional em segundos.
          </p>
          <Link
            href="/landing-pages/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium text-sm transition-colors"
          >
            <Plus size={16} />
            Criar primeira landing page
          </Link>
        </div>
      )}

      {/* Grid de cards */}
      {pages.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pages.map((lp: LandingPage) => (
            <LandingPageCard key={lp.id} lp={lp} lpBaseUrl={lpBaseUrl} />
          ))}
        </div>
      )}
    </div>
  );
}
