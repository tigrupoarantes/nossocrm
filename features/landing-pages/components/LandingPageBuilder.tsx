'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Globe, Save, Loader2, Send, Sparkles,
  BarChart3, CheckCircle2, AlertCircle, Target, ExternalLink, ImagePlus,
  Upload, Check,
} from 'lucide-react';
import { useUploadLandingPageImage } from '../hooks/useLandingPageAssets';
import { useLandingPage, useCreateLandingPage, useUpdateLandingPage } from '../hooks/useLandingPages';
import { useGeneratePage } from '../hooks/useGeneratePage';
import { generateSlug } from '../lib/slug-utils';
import { LivePreview } from './LivePreview';
import { PublishDialog } from './PublishDialog';
import { SubmissionsList } from './SubmissionsList';
import { useBoards } from '@/lib/query/hooks/useBoardsQuery';
import { useAuth } from '@/context/AuthContext';
import type { LandingPage } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status?: 'generating' | 'done' | 'error';
}

interface LandingPageBuilderProps {
  landingPageId?: string;
}

type Tab = 'builder' | 'leads';

const SUGGESTIONS = [
  'Landing page para captar leads para um curso de marketing digital',
  'Página de vendas para serviço de consultoria empresarial',
  'Landing page de lançamento para um produto SaaS',
];

const REFINEMENT_SUGGESTIONS = [
  'Trocar a paleta de cores para algo mais quente',
  'Melhorar o hero — mais impactante e com prova social',
  'Adicionar mais depoimentos de clientes',
  'Mudar o CTA para algo mais urgente',
  'Tornar mais visual, com fotos maiores',
  'Simplificar — menos seções, mais direto ao ponto',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LandingPageBuilder({ landingPageId }: LandingPageBuilderProps) {
  const router = useRouter();
  const isNew = !landingPageId;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: existingLP, isLoading: isLoadingLP } = useLandingPage(landingPageId ?? null);
  const createMutation = useCreateLandingPage();
  const updateMutation = useUpdateLandingPage();
  const generateMutation = useGeneratePage();
  const { data: boards } = useBoards();
  const { organizationId } = useAuth();

  // Core state
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [liveHtml, setLiveHtml] = useState(''); // acumula chunks durante streaming
  const [savedId, setSavedId] = useState<string | null>(landingPageId ?? null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Destino dos leads
  const [targetBoardId, setTargetBoardId] = useState('');
  const [targetStageId, setTargetStageId] = useState('');

  // UI state
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('builder');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isDragging, setIsDragging] = useState(false);

  // Upload de imagens
  const uploadMutation = useUploadLandingPageImage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageResolveRef = useRef<((url: string | null) => void) | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Hydrate com LP existente
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!existingLP) return;
    setTitle(existingLP.title ?? '');
    setSlug(existingLP.slug ?? '');
    setHtmlContent(existingLP.htmlContent ?? '');
    setTargetBoardId(existingLP.targetBoardId ?? '');
    setTargetStageId(existingLP.targetStageId ?? '');
    if (existingLP.promptUsed && messages.length === 0) {
      setMessages([
        { id: 'init-user', role: 'user', text: existingLP.promptUsed, status: 'done' },
        {
          id: 'init-ai', role: 'assistant',
          text: '✓ Landing page carregada. Descreva uma alteração abaixo para refiná-la.',
          status: 'done',
        },
      ]);
    }
  }, [existingLP]);

  // Scroll automático no chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (isNew && !savedId) setSlug(generateSlug(value));
  };

  const isGenerating = generateMutation.isPending;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const currentStatus = existingLP?.status ?? 'draft';
  const currentId = savedId ?? landingPageId;
  const isRefinement = !!htmlContent && messages.length > 0;

  // Destino dos leads — derivações
  const selectedBoard = boards?.find(b => b.id === targetBoardId) ?? null;
  const availableStages = selectedBoard?.stages ?? [];

  async function handleBoardChange(boardId: string) {
    setTargetBoardId(boardId);
    setTargetStageId('');
    const id = savedId ?? landingPageId;
    if (id) {
      await updateMutation.mutateAsync({ id, targetBoardId: boardId, targetStageId: null });
    }
  }

  async function handleStageChange(stageId: string) {
    setTargetStageId(stageId);
    const id = savedId ?? landingPageId;
    if (id) {
      await updateMutation.mutateAsync({ id, targetBoardId, targetStageId: stageId });
    }
  }

  // -------------------------------------------------------------------------
  // Auto-save debounced (quando o editor visual envia HTML editado)
  // -------------------------------------------------------------------------
  function handleEditorHtmlChange(newHtml: string) {
    setHtmlContent(newHtml);
    setLiveHtml(newHtml);

    const id = savedId ?? landingPageId;
    if (!id || isGenerating) return;

    // Debounce 2s
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setSaveStatus('idle');
    autoSaveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await updateMutation.mutateAsync({ id, htmlContent: newHtml });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    }, 2000);
  }

  // -------------------------------------------------------------------------
  // Upload de imagem (file picker ou drag-and-drop)
  // -------------------------------------------------------------------------
  async function handleImageFile(file: File): Promise<string | null> {
    const orgId = organizationId;
    const lpId = savedId ?? landingPageId;
    if (!orgId || !lpId) return null;

    try {
      return await uploadMutation.mutateAsync({ orgId, lpId, file });
    } catch {
      return null;
    }
  }

  // Chamado pelo LivePreview quando user clica em "Trocar imagem"
  async function handleRequestImageUpload(): Promise<string | null> {
    return new Promise((resolve) => {
      imageResolveRef.current = resolve;
      fileInputRef.current?.click();
    });
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset para permitir mesmo arquivo
    if (!file) {
      imageResolveRef.current?.(null);
      imageResolveRef.current = null;
      return;
    }
    const url = await handleImageFile(file);
    if (imageResolveRef.current) {
      imageResolveRef.current(url);
      imageResolveRef.current = null;
    } else if (url) {
      // Upload via botão do chat — injeta no input
      setInputValue(prev => {
        const prefix = prev.trim() ? prev.trim() + '\n' : '';
        return prefix + `Use esta imagem na página: ${url}`;
      });
    }
  }

  // Drag and drop na área do chat
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const url = await handleImageFile(file);
    if (url) {
      setInputValue(prev => {
        const prefix = prev.trim() ? prev.trim() + '\n' : '';
        return prefix + `Use esta imagem na página: ${url}`;
      });
    }
  }

  // HTML que o preview deve exibir.
  // Usa liveHtml (chunks ao vivo) quando disponível, depois cai para htmlContent.
  // NÃO depende de isGenerating para evitar race condition: React Query pode
  // marcar isPending=false em um render antes de setHtmlContent ser aplicado,
  // causando um flash de preview vazio.
  const previewHtml = liveHtml || htmlContent;

  async function handleSubmit() {
    const text = inputValue.trim();
    if (!text || isGenerating) return;

    setInputValue('');
    setCreateError(null);
    setLiveHtml(''); // limpa o streaming da geração anterior

    const userMsgId = `u-${Date.now()}`;
    const aiMsgId = `a-${Date.now()}`;

    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: 'user', text },
      { id: aiMsgId, role: 'assistant', text: '', status: 'generating' },
    ]);

    // Auto-título a partir do prompt se ainda não tiver
    const lpTitle = title.trim() || text.split(' ').slice(0, 6).join(' ');
    const lpSlug = slug || generateSlug(lpTitle);
    if (!title.trim()) { setTitle(lpTitle); setSlug(lpSlug); }

    // Criar rascunho se for LP nova
    let resolvedId = savedId;
    let createdLP: LandingPage | null = null;
    if (isNew && !resolvedId) {
      try {
        createdLP = await createMutation.mutateAsync({
          title: lpTitle, slug: lpSlug,
          targetBoardId: targetBoardId || undefined,
          targetStageId: targetStageId || undefined,
        });
        resolvedId = createdLP.id;
        setSavedId(createdLP.id);
      } catch (e) {
        setCreateError((e as Error).message ?? 'Erro ao criar landing page.');
        setMessages(prev => prev.map(m =>
          m.id === aiMsgId
            ? { ...m, text: 'Erro ao criar a landing page. Tente novamente.', status: 'error' }
            : m
        ));
        return;
      }
    }

    const resolvedApiKey = createdLP?.webhookApiKey ?? existingLP?.webhookApiKey ?? 'key';
    const resolvedWebhook = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/p/${lpSlug}/submit`;

    try {
      const result = await generateMutation.mutateAsync({
        prompt: text,
        orgName: lpTitle,
        webhookUrl: resolvedWebhook,
        apiKey: resolvedApiKey,
        currentHtml: isRefinement ? htmlContent : undefined,
        onChunk: (partial) => setLiveHtml(partial),
      });

      setHtmlContent(result.html);
      // Mantém liveHtml com o HTML final limpo — garante que o preview nunca
      // fique vazio por race condition entre htmlContent e liveHtml.
      // liveHtml é apagado no INÍCIO da próxima geração (acima).
      setLiveHtml(result.html);

      setMessages(prev => prev.map(m =>
        m.id === aiMsgId
          ? {
              ...m,
              text: isRefinement
                ? '✓ Alteração aplicada com sucesso!'
                : '✓ Landing page gerada! Descreva uma alteração para refiná-la.',
              status: 'done',
            }
          : m
      ));

      if (resolvedId) {
        await updateMutation.mutateAsync({
          id: resolvedId,
          htmlContent: result.html,
          promptUsed: isRefinement ? undefined : text,
          aiModel: result.model,
        });
      }
    } catch (e) {
      setLiveHtml('');
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId
          ? { ...m, text: (e as Error).message ?? 'Erro ao gerar. Tente novamente.', status: 'error' }
          : m
      ));
    }
  }

  async function handleSave() {
    if (!title.trim()) { alert('O nome da landing page é obrigatório.'); return; }
    if (isNew && !savedId) {
      const created = await createMutation.mutateAsync({ title, slug, htmlContent });
      setSavedId(created.id);
      router.replace(`/landing-pages/${created.id}`);
    } else {
      await updateMutation.mutateAsync({ id: savedId ?? landingPageId ?? '', title, slug, htmlContent });
    }
  }

  // -------------------------------------------------------------------------
  // Loading skeleton
  // -------------------------------------------------------------------------
  if (!isNew && isLoadingLP) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-white/10 shrink-0">
        <button
          onClick={() => router.push('/landing-pages')}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors shrink-0"
          title="Voltar"
        >
          <ArrowLeft size={18} />
        </button>

        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Nome da landing page..."
          className="flex-1 min-w-0 text-lg font-bold bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
        />

        {slug && (
          <span className="text-xs text-slate-400 font-mono hidden md:block shrink-0 truncate max-w-40">
            /p/{slug}
          </span>
        )}

        <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
          currentStatus === 'published'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        }`}>
          {currentStatus === 'published' ? 'Publicada' : 'Rascunho'}
        </span>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors shrink-0"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          <span className="hidden sm:inline">Salvar</span>
        </button>

        {/* Indicador de auto-save */}
        {saveStatus === 'saving' && (
          <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
            <Loader2 size={12} className="animate-spin" /> Salvando...
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-xs text-green-500 flex items-center gap-1 shrink-0">
            <Check size={12} /> Salvo
          </span>
        )}

        {currentStatus === 'published' && slug && (
          <a
            href={`/p/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors shrink-0"
          >
            <ExternalLink size={14} />
            <span className="hidden sm:inline">Abrir LP</span>
          </a>
        )}

        <button
          onClick={() => setShowPublishDialog(true)}
          disabled={!currentId}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium transition-colors shrink-0"
        >
          <Globe size={14} />
          <span className="hidden sm:inline">
            {currentStatus === 'published' ? 'Configurar' : 'Publicar'}
          </span>
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-white/10 shrink-0">
        {([
          { id: 'builder' as Tab, label: 'Builder', icon: Sparkles },
          { id: 'leads' as Tab, label: 'Leads', icon: BarChart3 },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Builder ── */}
      {activeTab === 'builder' && (
        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 pt-4">

          {/* Painel esquerdo — Chat */}
          <div
            className={`w-full lg:w-80 shrink-0 flex flex-col gap-2 min-h-0 relative ${isDragging ? 'ring-2 ring-primary-500 ring-inset rounded-xl' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isDragging && (
              <div className="absolute inset-0 bg-primary-50/80 dark:bg-primary-900/30 rounded-xl z-20 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-2 text-primary-600 dark:text-primary-400">
                  <Upload size={32} />
                  <span className="text-sm font-medium">Solte a imagem aqui</span>
                </div>
              </div>
            )}

            {/* Histórico de mensagens */}
            <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
              {messages.length === 0 ? (
                /* Empty state — sugestões */
                <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-6 px-2">
                  <div className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <Sparkles size={22} className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700 dark:text-white text-sm">
                      Crie sua landing page
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Descreva o que você quer — a IA gera o HTML completo
                    </p>
                  </div>
                  <div className="space-y-2 w-full">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setInputValue(s)}
                        className="w-full text-left text-xs px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors leading-relaxed"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Mensagens */
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0 mt-0.5">
                        {msg.status === 'generating' ? (
                          <Loader2 size={12} className="animate-spin text-primary-600 dark:text-primary-400" />
                        ) : msg.status === 'error' ? (
                          <AlertCircle size={12} className="text-red-500" />
                        ) : (
                          <CheckCircle2 size={12} className="text-primary-600 dark:text-primary-400" />
                        )}
                      </div>
                    )}
                    <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary-600 text-white rounded-br-sm'
                        : msg.status === 'error'
                          ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-bl-sm'
                          : 'bg-slate-100 dark:bg-white/8 text-slate-700 dark:text-slate-300 rounded-bl-sm'
                    }`}>
                      {msg.status === 'generating' && !msg.text
                        ? <span className="italic text-slate-400 dark:text-slate-500">Gerando HTML...</span>
                        : msg.text}
                    </div>
                  </div>
                ))
              )}

              {/* Sugestões de refinamento após primeira geração */}
              {isRefinement && !isGenerating && messages.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Sugestões</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REFINEMENT_SUGGESTIONS.slice(0, 4).map((s) => (
                      <button
                        key={s}
                        onClick={() => setInputValue(s)}
                        className="text-[11px] px-2.5 py-1.5 rounded-full border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {createError && (
              <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2 shrink-0">
                {createError}
              </p>
            )}

            {/* Destino dos leads */}
            <div className="shrink-0 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Target size={12} />
                Destino dos Leads
              </div>
              <select
                value={targetBoardId}
                onChange={(e) => handleBoardChange(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">Selecione o funil (board)...</option>
                {(boards ?? []).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <select
                value={targetStageId}
                onChange={(e) => handleStageChange(e.target.value)}
                disabled={!targetBoardId}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-40"
              >
                <option value="">Selecione o estágio...</option>
                {availableStages.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              {targetBoardId && targetStageId && selectedBoard && (
                <p className="text-xs text-primary-600 dark:text-primary-400 font-medium truncate">
                  ✓ Leads → {selectedBoard.name} › {availableStages.find(s => s.id === targetStageId)?.label}
                </p>
              )}
            </div>

            {/* Input de prompt */}
            <div className="shrink-0 relative">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                }}
                placeholder={isRefinement
                  ? 'Solicite uma alteração... (ex: mude a cor para azul)'
                  : 'Descreva sua landing page...'}
                rows={3}
                disabled={isGenerating}
                className="w-full px-3 py-2.5 pr-20 text-sm bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none disabled:opacity-50"
              />
              <div className="absolute right-2 bottom-2.5 flex items-center gap-1">
                <button
                  onClick={() => {
                    imageResolveRef.current = null;
                    fileInputRef.current?.click();
                  }}
                  disabled={isGenerating || uploadMutation.isPending}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-40 transition-colors"
                  title="Upload de imagem (JPEG, PNG, WebP)"
                >
                  {uploadMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isGenerating || !inputValue.trim()}
                  className="p-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white transition-colors"
                  title="Enviar (Enter)"
                >
                  {isGenerating
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Send size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* Painel direito — Preview */}
          <div className="flex-1 min-h-0 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden">
            <LivePreview
              html={previewHtml}
              mode={previewMode}
              onModeChange={setPreviewMode}
              isGenerating={isGenerating && !liveHtml && !htmlContent}
              onHtmlEdit={handleEditorHtmlChange}
              onRequestImageUpload={handleRequestImageUpload}
            />
          </div>
        </div>
      )}

      {/* ── Leads ── */}
      {activeTab === 'leads' && currentId && (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 mt-4">
          <SubmissionsList landingPageId={currentId} />
        </div>
      )}

      {showPublishDialog && currentId && (
        <PublishDialog
          landingPageId={currentId}
          slug={slug}
          status={currentStatus}
          onClose={() => setShowPublishDialog(false)}
        />
      )}

      {/* Input oculto para upload de imagens (file picker) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileInputChange}
      />
    </div>
  );
}
