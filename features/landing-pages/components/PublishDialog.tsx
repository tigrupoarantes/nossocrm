'use client';

import React, { useState } from 'react';
import { Globe, Copy, Check, Loader2, ExternalLink, AlertCircle, Eye } from 'lucide-react';
import { usePublishLandingPage, useUpdateLandingPage, useLandingPage } from '../hooks/useLandingPages';
import { LivePreview } from './LivePreview';

interface PublishDialogProps {
  landingPageId: string;
  slug: string;
  status: string;
  onClose: () => void;
}

const SLUG_REGEX = /^[a-z0-9-]+$/;

export function PublishDialog({ landingPageId, slug, status, onClose }: PublishDialogProps) {
  const publishMutation = usePublishLandingPage(landingPageId);
  const updateMutation = useUpdateLandingPage();
  const { data: lp } = useLandingPage(landingPageId);
  const [copied, setCopied] = useState(false);
  const [slugInput, setSlugInput] = useState(slug);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  const lpBaseUrl = process.env.NEXT_PUBLIC_LP_BASE_URL ?? '/p';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicUrl = `${origin}${lpBaseUrl}/${slugInput || slug}`;

  const isPublished = status === 'published';
  const slugChanged = slugInput !== slug;
  const slugInvalid = slugInput.length > 0 && !SLUG_REGEX.test(slugInput);

  async function handlePublish() {
    setSlugError(null);
    // Se o slug mudou, salva primeiro
    if (slugChanged && !slugInvalid && slugInput) {
      try {
        await updateMutation.mutateAsync({ id: landingPageId, slug: slugInput });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('Slug') || msg.includes('409') || msg.includes('já existe')) {
          setSlugError('Este endereço já está em uso. Escolha outro.');
        } else {
          setSlugError(msg || 'Erro ao salvar endereço.');
        }
        return;
      }
    }
    await publishMutation.mutateAsync();
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isPending = updateMutation.isPending || publishMutation.isPending;

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

        {/* Endereço público */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Endereço público
          </label>
          <div className={`flex items-center bg-slate-50 dark:bg-white/5 rounded-xl border transition-colors overflow-hidden ${
            slugInvalid
              ? 'border-red-400 dark:border-red-500'
              : 'border-slate-200 dark:border-white/10 focus-within:border-primary-400'
          }`}>
            {/* Parte fixa */}
            <span className="pl-3 py-2.5 text-sm text-slate-400 dark:text-slate-500 whitespace-nowrap font-mono shrink-0">
              {origin}{lpBaseUrl}/
            </span>
            {/* Slug editável */}
            {isPublished ? (
              <span className="flex-1 py-2.5 text-sm text-slate-700 dark:text-slate-300 font-mono truncate">
                {slug}
              </span>
            ) : (
              <input
                type="text"
                value={slugInput}
                onChange={e => {
                  setSlugInput(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                  setSlugError(null);
                }}
                className="flex-1 py-2.5 text-sm text-slate-700 dark:text-slate-300 font-mono bg-transparent focus:outline-none min-w-0"
                placeholder="meu-slug"
                spellCheck={false}
              />
            )}
            {/* Ações */}
            <div className="flex items-center gap-0.5 pr-2 shrink-0">
              <button
                onClick={handleCopy}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                title="Copiar URL"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
              {isPublished && (
                <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </div>

          {/* Aviso de slug inválido */}
          {slugInvalid && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle size={11} />
              Apenas letras minúsculas, números e hífens
            </p>
          )}
          {/* Erro de slug duplicado */}
          {slugError && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle size={11} />
              {slugError}
            </p>
          )}
        </div>

        {/* Botão de preview fullscreen */}
        {lp?.htmlContent && (
          <button
            onClick={() => setShowFullPreview(true)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <Eye size={14} />
            Visualizar em tela cheia antes de publicar
          </button>
        )}

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
              disabled={isPending || slugInvalid || !slugInput}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
            >
              {isPending ? (
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

      {/* Fullscreen preview (read-only) */}
      {showFullPreview && lp?.htmlContent && (
        <LivePreview
          html={lp.htmlContent}
          mode={previewMode}
          onModeChange={setPreviewMode}
          initialFullscreen
          onFullscreenClose={() => setShowFullPreview(false)}
        />
      )}
    </div>
  );
}
