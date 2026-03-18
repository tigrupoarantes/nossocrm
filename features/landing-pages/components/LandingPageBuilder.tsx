'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Save, Globe, ArrowLeft, Loader2, RefreshCw, BarChart3 } from 'lucide-react';
import { useLandingPage, useCreateLandingPage, useUpdateLandingPage } from '../hooks/useLandingPages';
import { useGeneratePage } from '../hooks/useGeneratePage';
import { generateSlug } from '../lib/slug-utils';
import { LivePreview } from './LivePreview';
import { PublishDialog } from './PublishDialog';
import { SubmissionsList } from './SubmissionsList';
import type { LandingPageField } from '@/types';

interface LandingPageBuilderProps {
  landingPageId?: string;
}

type Tab = 'builder' | 'leads';

export function LandingPageBuilder({ landingPageId }: LandingPageBuilderProps) {
  const router = useRouter();
  const isNew = !landingPageId;

  const { data: existingLP, isLoading: isLoadingLP } = useLandingPage(landingPageId ?? null);
  const createMutation = useCreateLandingPage();
  const updateMutation = useUpdateLandingPage(landingPageId ?? '');
  const generateMutation = useGeneratePage();

  // Form state
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('builder');
  const [savedId, setSavedId] = useState<string | null>(landingPageId ?? null);

  // Preencher estado ao carregar LP existente
  useEffect(() => {
    if (existingLP) {
      setTitle(existingLP.title ?? '');
      setSlug(existingLP.slug ?? '');
      setHtmlContent(existingLP.htmlContent ?? '');
      setPrompt(existingLP.promptUsed ?? '');
    }
  }, [existingLP]);

  // Auto-gerar slug ao digitar título (apenas para novas LPs)
  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (isNew) setSlug(generateSlug(value));
  };

  // Obter URL do webhook para a LP atual
  const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/p/${slug || 'minha-lp'}/submit`;
  const apiKey = existingLP?.webhookApiKey ?? 'preview-key';

  async function handleGenerate() {
    if (!prompt.trim()) return;
    if (!title.trim()) {
      alert('Dê um nome para a landing page antes de gerar.');
      return;
    }

    // Salvar rascunho primeiro se for nova
    let currentId = savedId;
    if (isNew && !currentId) {
      try {
        const created = await createMutation.mutateAsync({ title, slug });
        currentId = created.id;
        setSavedId(created.id);
      } catch {
        return;
      }
    }

    const result = await generateMutation.mutateAsync({
      prompt,
      orgName: title,
      webhookUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/api/p/${slug}/submit`,
      apiKey: existingLP?.webhookApiKey ?? 'key',
      formFields: [] as LandingPageField[],
    });

    setHtmlContent(result.html);

    // Salvar HTML gerado automaticamente
    if (currentId) {
      await updateMutation.mutateAsync({
        htmlContent: result.html,
        promptUsed: prompt,
        aiModel: result.model,
      });
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      alert('O nome da landing page é obrigatório.');
      return;
    }

    if (isNew && !savedId) {
      const created = await createMutation.mutateAsync({ title, slug, htmlContent, promptUsed: prompt });
      setSavedId(created.id);
      router.replace(`/landing-pages/${created.id}`);
    } else {
      await updateMutation.mutateAsync({ title, slug, htmlContent, promptUsed: prompt });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isGenerating = generateMutation.isPending;
  const currentStatus = existingLP?.status ?? 'draft';
  const currentId = savedId ?? landingPageId;

  if (!isNew && isLoadingLP) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/landing-pages')}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Nome da landing page..."
            className="w-full text-xl font-bold bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          {slug && (
            <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">
              /p/{slug}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Status badge */}
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${currentStatus === 'published'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
            }`}>
            {currentStatus === 'published' ? 'Publicada' : 'Rascunho'}
          </span>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>

          <button
            onClick={() => setShowPublishDialog(true)}
            disabled={!currentId}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            <Globe size={14} />
            {currentStatus === 'published' ? 'Ver publicada' : 'Publicar'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-white/10">
        {([
          { id: 'builder', label: 'Builder', icon: Sparkles },
          { id: 'leads', label: 'Leads', icon: BarChart3 },
        ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === id
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white'
              }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Builder */}
      {activeTab === 'builder' && (
        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
          {/* Coluna esquerda: prompt + config */}
          <div className="w-full lg:w-80 shrink-0 space-y-4">
            {/* Prompt */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Descreva sua landing page
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex: Landing page para captação de leads para curso de marketing digital. Público-alvo: empreendedores. Destaque os benefícios: certificado, mentoria ao vivo e acesso vitalício."
                rows={6}
                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium text-sm transition-colors"
            >
              {isGenerating ? (
                <><Loader2 size={16} className="animate-spin" />Gerando HTML...</>
              ) : htmlContent ? (
                <><RefreshCw size={16} />Regenerar com IA</>
              ) : (
                <><Sparkles size={16} />Gerar com IA</>
              )}
            </button>

            {generateMutation.error && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2">
                {generateMutation.error.message}
              </p>
            )}

            {/* Config: slug */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                URL (Slug)
              </label>
              <div className="flex items-center gap-1.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2">
                <span className="text-xs text-slate-400">/p/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="flex-1 text-sm bg-transparent text-slate-900 dark:text-white focus:outline-none"
                  placeholder="minha-landing-page"
                />
              </div>
            </div>

            {/* HTML bruto (colapsável) */}
            {htmlContent && (
              <details className="group">
                <summary className="text-xs font-medium text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300">
                  Ver/editar HTML bruto
                </summary>
                <textarea
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  rows={10}
                  className="mt-2 w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
                />
              </details>
            )}
          </div>

          {/* Coluna direita: preview */}
          <div className="flex-1 min-h-0 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
            <LivePreview html={htmlContent} mode={previewMode} onModeChange={setPreviewMode} />
          </div>
        </div>
      )}

      {/* Tab: Leads */}
      {activeTab === 'leads' && currentId && (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6">
          <SubmissionsList landingPageId={currentId} />
        </div>
      )}

      {/* Dialog de publicação */}
      {showPublishDialog && currentId && (
        <PublishDialog
          landingPageId={currentId}
          slug={slug}
          status={currentStatus}
          onClose={() => setShowPublishDialog(false)}
        />
      )}
    </div>
  );
}
