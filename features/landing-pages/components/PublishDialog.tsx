'use client';

import React, { useState } from 'react';
import { Globe, Copy, Check, Loader2, ExternalLink } from 'lucide-react';
import { usePublishLandingPage } from '../hooks/useLandingPages';

interface PublishDialogProps {
  landingPageId: string;
  slug: string;
  status: string;
  onClose: () => void;
}

export function PublishDialog({ landingPageId, slug, status, onClose }: PublishDialogProps) {
  const publishMutation = usePublishLandingPage(landingPageId);
  const [copied, setCopied] = useState(false);

  const lpBaseUrl = process.env.NEXT_PUBLIC_LP_BASE_URL ?? '/p';
  const publicUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${lpBaseUrl}/${slug}`;

  const isPublished = status === 'published';

  async function handlePublish() {
    await publishMutation.mutateAsync();
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-md p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Globe size={20} className="text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">
              {isPublished ? 'Landing Page Publicada' : 'Publicar Landing Page'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isPublished ? 'Sua página está ao vivo.' : 'Torne sua página acessível publicamente.'}
            </p>
          </div>
        </div>

        {/* URL pública */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">URL Pública</label>
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-white/5 rounded-xl px-3 py-2.5 border border-slate-200 dark:border-white/10">
            <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate font-mono">{publicUrl}</span>
            <button
              onClick={handleCopy}
              className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
              title="Copiar URL"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
            {isPublished && (
              <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>

        {/* Botões */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            {isPublished ? 'Fechar' : 'Cancelar'}
          </button>
          {!isPublished && (
            <button
              onClick={handlePublish}
              disabled={publishMutation.isPending}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
            >
              {publishMutation.isPending ? (
                <><Loader2 size={14} className="animate-spin" />Publicando...</>
              ) : (
                <><Globe size={14} />Publicar agora</>
              )}
            </button>
          )}
        </div>

        {publishMutation.error && (
          <p className="text-xs text-red-500 text-center">{publishMutation.error.message}</p>
        )}
      </div>
    </div>
  );
}
