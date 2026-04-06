'use client';

import React from 'react';
import Link from 'next/link';
import { Users, Loader2, ExternalLink, Download } from 'lucide-react';
import { useLandingPageSubmissions } from '../hooks/useLandingPages';

interface SubmissionsListProps {
  landingPageId: string;
}

export function SubmissionsList({ landingPageId }: SubmissionsListProps) {
  const { data, isLoading } = useLandingPageSubmissions(landingPageId);

  const submissions = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Users size={28} className="text-slate-300 dark:text-slate-600 mb-2" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma submissão ainda.</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Leads capturados vão aparecer aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Leads Capturados <span className="text-slate-400">({data?.totalCount})</span>
        </h3>
        <a
          href={`/api/landing-pages/${landingPageId}/submissions/export`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          download
        >
          <Download size={12} />
          Exportar CSV
        </a>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-white/5">
        {(submissions as any[]).map((sub) => {
          const name = sub.form_data?.name || sub.form_data?.nome || sub.contacts?.name || 'Lead';
          const email = sub.form_data?.email || sub.contacts?.email || '';
          const phone = sub.form_data?.phone || sub.form_data?.telefone || '';
          const createdAt = new Date(sub.created_at).toLocaleDateString('pt-BR', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
          });

          return (
            <div key={sub.id} className="py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-xs shrink-0">
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{name}</p>
                  <p className="text-xs text-slate-400 truncate">{email || phone || 'Sem contato'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-slate-400 hidden sm:block">{createdAt}</span>
                {sub.deals?.id && (
                  <Link
                    href={`/deals/${sub.deals.id}`}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                  >
                    Deal <ExternalLink size={10} />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
