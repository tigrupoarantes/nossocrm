'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, Pencil, Plus, Trash2, X, Zap } from 'lucide-react';
import { useBoards } from '@/lib/query/hooks';
import { boardStagesService } from '@/lib/supabase';
import { FirstTimeBanner } from '@/components/help/FirstTimeBanner';
import { HelpPopover } from '@/components/help/HelpPopover';
import { useAuth } from '@/context/AuthContext';
import {
  useUploadConversationAttachment,
  type AttachmentMediaType,
} from '@/features/conversations/hooks/useConversationAttachment';
import {
  useAutomationRules,
  useCreateAutomationRule,
  useUpdateAutomationRule,
  useDeleteAutomationRule,
  type AutomationRule,
} from '../hooks/useAutomationRules';

type TriggerType = AutomationRule['trigger_type'];
type ActionType = AutomationRule['action_type'];

const TRIGGER_LABELS: Record<TriggerType, string> = {
  deal_created: 'Quando um lead entra no board',
  response_received: 'Quando o lead responde',
  stage_entered: 'Quando o lead entra na coluna',
  days_in_stage: 'Após N dias no estágio',
};

const ACTION_LABELS: Record<ActionType, string> = {
  send_whatsapp: 'Enviar mensagem WhatsApp',
  send_email: 'Enviar e-mail',
  move_stage: 'Mover para outro estágio',
  move_to_next_board: 'Mover para próximo board',
};

const VARIABLE_SNIPPETS = [
  { label: 'Nome do contato', value: '{{nome_contato}}' },
  { label: 'Empresa', value: '{{empresa_lead}}' },
  { label: 'CNPJ', value: '{{cnpj}}' },
  { label: 'Segmento', value: '{{segmento}}' },
];

interface AttachmentState {
  url: string;
  mediaType: AttachmentMediaType;
  filename: string;
  mimetype: string;
}

interface FormState {
  name: string;
  boardId: string;
  /** Coluna específica do board (opcional). Em branco = vale para o board todo. */
  stageId: string;
  triggerType: TriggerType;
  actionType: ActionType;
  messageBody: string;
  /** Assunto do e-mail (apenas action_type=send_email). */
  emailSubject: string;
  /** Anexo opcional (WhatsApp ou e-mail). */
  attachment: AttachmentState | null;
  fromStageId: string;
  toStageId: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  boardId: '',
  stageId: '',
  triggerType: 'deal_created',
  actionType: 'send_whatsapp',
  messageBody: 'Olá, {{nome_contato}}! Obrigado pelo interesse. Em que posso ajudar?',
  emailSubject: 'Olá, {{nome_contato}} — vamos conversar?',
  attachment: null,
  fromStageId: '',
  toStageId: '',
};

interface BoardStage { id: string; name: string; label?: string; boardId: string; order?: number }

function useBoardStages() {
  const [stages, setStages] = useState<BoardStage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await boardStagesService.getAll();
        if (active && data) {
          setStages(data.map(s => ({
            id: s.id,
            name: s.name,
            label: s.label ?? undefined,
            boardId: s.board_id,
            order: s.order ?? undefined,
          })));
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return { stages, isLoading };
}

export function AutomationsPage() {
  const { data: rules, isLoading } = useAutomationRules();
  const { data: boards } = useBoards();
  const { stages } = useBoardStages();
  const createMutation = useCreateAutomationRule();
  const updateMutation = useUpdateAutomationRule();
  const deleteMutation = useDeleteAutomationRule();
  const { organizationId } = useAuth();
  const uploadAttachment = useUploadConversationAttachment();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const boardList = boards ?? [];
  const stagesForBoard = form.boardId
    ? stages.filter(s => s.boardId === form.boardId)
    : [];

  const insertVariable = (v: string) => {
    setForm(prev => ({ ...prev, messageBody: `${prev.messageBody}${v}` }));
  };

  const insertSubjectVariable = (v: string) => {
    setForm(prev => ({ ...prev, emailSubject: `${prev.emailSubject}${v}` }));
  };

  const handlePickAttachment = () => {
    if (!organizationId) {
      setError('Sessão ainda carregando. Tente em alguns segundos.');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !organizationId) return;
    setError(null);
    try {
      const result = await uploadAttachment.mutateAsync({ organizationId, file });
      setForm(prev => ({
        ...prev,
        attachment: {
          url: result.url,
          mediaType: result.mediaType,
          filename: result.filename,
          mimetype: result.mimetype,
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar anexo.');
    }
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setEditingRuleId(null);
    setIsFormOpen(false);
  };

  const startEdit = (rule: AutomationRule) => {
    const cfg = rule.action_config as Record<string, unknown>;
    const att = cfg.attachment as
      | { url: string; mediaType: AttachmentMediaType; filename?: string; mimetype?: string }
      | undefined;
    setForm({
      name: rule.name,
      boardId: rule.board_id ?? '',
      stageId: rule.stage_id ?? '',
      triggerType: rule.trigger_type,
      actionType: rule.action_type,
      messageBody: (cfg.body as string) ?? '',
      emailSubject: (cfg.subject as string) ?? '',
      attachment: att
        ? {
            url: att.url,
            mediaType: att.mediaType,
            filename: att.filename ?? 'anexo',
            mimetype: att.mimetype ?? '',
          }
        : null,
      fromStageId: ((rule.trigger_config as Record<string, unknown>)?.stageId as string) ?? '',
      toStageId: (cfg.stageId as string) ?? '',
    });
    setEditingRuleId(rule.id);
    setError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.name.trim()) {
      setError('Informe um nome para a regra.');
      return;
    }

    const triggerConfig: Record<string, unknown> = {};
    if (form.triggerType === 'response_received' && form.fromStageId) {
      triggerConfig.stageId = form.fromStageId;
    }

    const attachmentConfig = form.attachment
      ? {
          url: form.attachment.url,
          mediaType: form.attachment.mediaType,
          filename: form.attachment.filename,
          mimetype: form.attachment.mimetype,
        }
      : undefined;

    let actionConfig: Record<string, unknown> = {};
    if (form.actionType === 'send_whatsapp') {
      if (!form.messageBody.trim() && !attachmentConfig) {
        setError('Digite o corpo da mensagem ou anexe um arquivo.');
        return;
      }
      actionConfig = { body: form.messageBody, attachment: attachmentConfig };
    } else if (form.actionType === 'send_email') {
      if (!form.emailSubject.trim()) {
        setError('Informe o assunto do e-mail.');
        return;
      }
      if (!form.messageBody.trim()) {
        setError('Digite o corpo do e-mail.');
        return;
      }
      actionConfig = {
        subject: form.emailSubject,
        body: form.messageBody,
        attachment: attachmentConfig,
      };
    } else if (form.actionType === 'move_stage') {
      if (!form.toStageId) {
        setError('Selecione o estágio de destino.');
        return;
      }
      actionConfig = { stageId: form.toStageId };
    }

    const payload = {
      name: form.name.trim(),
      boardId: form.boardId || null,
      stageId: form.stageId || null,
      triggerType: form.triggerType,
      triggerConfig,
      actionType: form.actionType,
      actionConfig,
      isActive: true,
    };

    try {
      if (editingRuleId) {
        await updateMutation.mutateAsync({ id: editingRuleId, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const hasActiveRule = (rules ?? []).some(r => r.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-display">
            Automações
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Regras que disparam ao criar lead ou quando o lead responde.
          </p>
        </div>
        {!isFormOpen && (
          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium text-sm transition-colors shadow-sm"
          >
            <Plus size={16} /> Nova regra
          </button>
        )}
      </div>

      <FirstTimeBanner
        articleSlug="automacao-lead-novo-whatsapp"
        title="Crie a primeira mensagem automática pra leads novos"
        description="Lead frio fica frio em horas. Configure uma regra que manda WhatsApp na hora que o lead entra no board — sem ninguém digitar. O tutorial mostra o que escrever, quais variáveis usar e como testar."
        hidden={hasActiveRule}
      />

      <FirstTimeBanner
        articleSlug="automacao-resposta-mover-stage"
        title="Mova o card sozinho quando o lead responde"
        description="Pare de procurar quem respondeu. Configure uma regra que joga o card pra coluna 'Em conversa' no segundo em que vem mensagem nova. O vendedor olha só o que importa."
        hidden={hasActiveRule}
      />

      {isFormOpen && (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {editingRuleId ? 'Editar regra' : 'Nova regra'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Primeiro contato"
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Board</label>
              <select
                value={form.boardId}
                onChange={e => setForm({ ...form, boardId: e.target.value, stageId: '', fromStageId: '', toStageId: '' })}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todos os boards</option>
                {boardList.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                <span>Coluna (opcional)</span>
                <HelpPopover
                  title="Por que escolher uma coluna?"
                  description={
                    <>
                      Quando você seleciona uma coluna, a regra só dispara para leads que entram naquela coluna específica.{'\n\n'}
                      Deixe em branco se quiser que a regra valha para o board inteiro.
                    </>
                  }
                />
              </label>
              <select
                value={form.stageId}
                onChange={e => setForm({ ...form, stageId: e.target.value })}
                disabled={!form.boardId}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm disabled:opacity-60"
              >
                <option value="">Board todo</option>
                {stagesForBoard
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.label || s.name}</option>
                  ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                <span>Gatilho</span>
                <HelpPopover
                  title="O que é um gatilho?"
                  description={
                    <>
                      É o evento que faz a regra disparar. Os mais usados:
                      {'\n'}
                      • <strong>Quando um lead entra no board</strong> — dispara assim que o deal é criado. Use pra mensagem de boas-vindas.{'\n'}
                      • <strong>Quando o lead responde</strong> — dispara quando vem mensagem nova do lead. Use pra mover o card.
                    </>
                  }
                  articleSlug="automacao-lead-novo-whatsapp"
                />
              </label>
              <select
                value={form.triggerType}
                onChange={e => setForm({ ...form, triggerType: e.target.value as TriggerType })}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="deal_created">{TRIGGER_LABELS.deal_created}</option>
                <option value="stage_entered">{TRIGGER_LABELS.stage_entered}</option>
                <option value="response_received">{TRIGGER_LABELS.response_received}</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                <span>Ação</span>
                <HelpPopover
                  title="O que é uma ação?"
                  description={
                    <>
                      É o que o CRM faz quando o gatilho acontece:
                      {'\n'}
                      • <strong>Enviar WhatsApp</strong> — manda mensagem pro telefone do contato.{'\n'}
                      • <strong>Mover para outro estágio</strong> — pula o card pra outra coluna do kanban.
                    </>
                  }
                />
              </label>
              <select
                value={form.actionType}
                onChange={e => setForm({ ...form, actionType: e.target.value as ActionType, attachment: null })}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="send_whatsapp">{ACTION_LABELS.send_whatsapp}</option>
                <option value="send_email">{ACTION_LABELS.send_email}</option>
                <option value="move_stage">{ACTION_LABELS.move_stage}</option>
              </select>
            </div>
          </div>

          {form.actionType === 'send_email' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Assunto</label>
              <input
                type="text"
                value={form.emailSubject}
                onChange={e => setForm({ ...form, emailSubject: e.target.value })}
                placeholder="Olá, {{nome_contato}} — vamos conversar?"
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-[10px] text-slate-400 self-center">Inserir no assunto:</span>
                {VARIABLE_SNIPPETS.map(v => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => insertSubjectVariable(v.value)}
                    className="text-[11px] px-2 py-0.5 rounded border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(form.actionType === 'send_whatsapp' || form.actionType === 'send_email') && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                <span>{form.actionType === 'send_email' ? 'Corpo do e-mail' : 'Mensagem'}</span>
                <HelpPopover
                  title="Como escrever uma boa mensagem?"
                  description={
                    <>
                      Curto, pessoal, com pergunta no final. Use as variáveis abaixo pra personalizar:{'\n\n'}
                      • <code>{'{{nome_contato}}'}</code> vira o nome do lead{'\n'}
                      • <code>{'{{empresa_lead}}'}</code> vira o nome da empresa{'\n'}
                      • <code>{'{{cnpj}}'}</code> e <code>{'{{segmento}}'}</code> também{'\n\n'}
                      Se o campo não estiver preenchido, vira string vazia (não aparece &quot;undefined&quot; pro lead).
                    </>
                  }
                  articleSlug="automacao-lead-novo-whatsapp"
                />
              </label>
              <textarea
                value={form.messageBody}
                onChange={e => setForm({ ...form, messageBody: e.target.value })}
                rows={5}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="Olá, {{nome_contato}}!"
              />
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[10px] text-slate-400 self-center">Inserir:</span>
                {VARIABLE_SNIPPETS.map(v => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => insertVariable(v.value)}
                    className="text-[11px] px-2 py-0.5 rounded border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5"
                  >
                    {v.label}
                  </button>
                ))}
                <span className="ml-auto" />
                <button
                  type="button"
                  onClick={handlePickAttachment}
                  disabled={uploadAttachment.isPending}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-60"
                >
                  {uploadAttachment.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Paperclip size={12} />
                  )}
                  Anexar
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,audio/ogg,audio/mpeg,audio/mp4,audio/webm,audio/wav,video/mp4"
                  onChange={handleAttachmentChange}
                  className="hidden"
                />
              </div>
              {form.attachment && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip size={14} className="text-slate-400 shrink-0" />
                    <span className="truncate text-slate-700 dark:text-slate-200">
                      {form.attachment.filename}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase text-slate-400">
                      {form.attachment.mediaType}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, attachment: null }))}
                    className="p-1 text-slate-400 hover:text-red-500"
                    aria-label="Remover anexo"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-1">
                {form.actionType === 'send_email'
                  ? 'O anexo será enviado junto com o e-mail. Limite 5 MB.'
                  : 'O texto vira legenda do anexo. Limite 5 MB.'}
              </p>
            </div>
          )}

          {form.actionType === 'move_stage' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Estágio de destino
              </label>
              <select
                value={form.toStageId}
                onChange={e => setForm({ ...form, toStageId: e.target.value })}
                disabled={!form.boardId}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm disabled:opacity-60"
              >
                <option value="">Selecione...</option>
                {stagesForBoard
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.label || s.name}</option>
                  ))}
              </select>
              {!form.boardId && (
                <p className="text-[10px] text-amber-600 mt-1">
                  Selecione um board para filtrar os estágios.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg shadow-sm disabled:opacity-50"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={14} className="animate-spin" />}
              {editingRuleId ? 'Salvar alterações' : 'Criar regra'}
            </button>
          </div>
        </div>
      )}

      {rules && rules.length === 0 && !isFormOpen && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mb-4">
            <Zap size={32} className="text-primary-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Nenhuma automação configurada
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm">
            Crie regras para enviar a 1ª mensagem automaticamente ou mover um lead quando ele responde.
          </p>
        </div>
      )}

      {rules && rules.length > 0 && (
        <div className="space-y-2">
          {rules.map(rule => {
            const boardName = boardList.find(b => b.id === rule.board_id)?.name ?? 'Todos os boards';
            const stageName = rule.stage_id
              ? (stages.find(s => s.id === rule.stage_id)?.label
                ?? stages.find(s => s.id === rule.stage_id)?.name
                ?? null)
              : null;
            const actionCfg = rule.action_config as Record<string, unknown>;
            const bodyPreview = String(actionCfg.body ?? '').slice(0, 60);
            const bodyEllipsis = String(actionCfg.body ?? '').length > 60 ? '…' : '';
            const hasAttachment = Boolean(
              (actionCfg.attachment as { url?: string } | undefined)?.url,
            );
            const actionDescription =
              rule.action_type === 'send_whatsapp'
                ? `WhatsApp: "${bodyPreview}${bodyEllipsis}"${hasAttachment ? ' · 📎' : ''}`
                : rule.action_type === 'send_email'
                  ? `E-mail: "${String(actionCfg.subject ?? '').slice(0, 60)}"${hasAttachment ? ' · 📎' : ''}`
                  : rule.action_type === 'move_stage'
                    ? `Mover para: ${stages.find(s => s.id === (actionCfg.stageId as string))?.name ?? '—'}`
                    : ACTION_LABELS[rule.action_type];

            return (
              <div
                key={rule.id}
                className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                      {rule.name}
                    </h3>
                    {!rule.is_active && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400">
                        PAUSADA
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium">{TRIGGER_LABELS[rule.trigger_type]}</span>
                    {' → '}
                    <span>{actionDescription}</span>
                    <span className="text-slate-400 dark:text-slate-500">
                      {' · '}{boardName}{stageName ? ` › ${stageName}` : ''}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rule.is_active}
                      onChange={e =>
                        updateMutation.mutate({ id: rule.id, isActive: e.target.checked })
                      }
                    />
                    Ativa
                  </label>
                  <button
                    type="button"
                    onClick={() => startEdit(rule)}
                    className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-md"
                    aria-label="Editar"
                    title="Editar regra"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remover a regra "${rule.name}"?`)) {
                        deleteMutation.mutate(rule.id);
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                    aria-label="Remover"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
