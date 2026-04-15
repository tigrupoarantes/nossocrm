'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Zap } from 'lucide-react';
import { useBoards } from '@/lib/query/hooks';
import { boardStagesService } from '@/lib/supabase';
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
  stage_entered: 'Quando entra em um estágio',
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

interface FormState {
  name: string;
  boardId: string;
  triggerType: TriggerType;
  actionType: ActionType;
  messageBody: string;
  fromStageId: string;
  toStageId: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  boardId: '',
  triggerType: 'deal_created',
  actionType: 'send_whatsapp',
  messageBody: 'Olá, {{nome_contato}}! Obrigado pelo interesse. Em que posso ajudar?',
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
            boardId: s.boardId,
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

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const boardList = boards ?? [];
  const stagesForBoard = form.boardId
    ? stages.filter(s => s.boardId === form.boardId)
    : [];

  const insertVariable = (v: string) => {
    setForm(prev => ({ ...prev, messageBody: `${prev.messageBody}${v}` }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setIsFormOpen(false);
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

    let actionConfig: Record<string, unknown> = {};
    if (form.actionType === 'send_whatsapp') {
      if (!form.messageBody.trim()) {
        setError('Digite o corpo da mensagem.');
        return;
      }
      actionConfig = { body: form.messageBody };
    } else if (form.actionType === 'move_stage') {
      if (!form.toStageId) {
        setError('Selecione o estágio de destino.');
        return;
      }
      actionConfig = { stageId: form.toStageId };
    }

    try {
      await createMutation.mutateAsync({
        name: form.name.trim(),
        boardId: form.boardId || null,
        triggerType: form.triggerType,
        triggerConfig,
        actionType: form.actionType,
        actionConfig,
        isActive: true,
      });
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

      {isFormOpen && (
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Nova regra
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
                onChange={e => setForm({ ...form, boardId: e.target.value, fromStageId: '', toStageId: '' })}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todos os boards</option>
                {boardList.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Gatilho</label>
              <select
                value={form.triggerType}
                onChange={e => setForm({ ...form, triggerType: e.target.value as TriggerType })}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="deal_created">{TRIGGER_LABELS.deal_created}</option>
                <option value="response_received">{TRIGGER_LABELS.response_received}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ação</label>
              <select
                value={form.actionType}
                onChange={e => setForm({ ...form, actionType: e.target.value as ActionType })}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="send_whatsapp">{ACTION_LABELS.send_whatsapp}</option>
                <option value="move_stage">{ACTION_LABELS.move_stage}</option>
              </select>
            </div>
          </div>

          {form.actionType === 'send_whatsapp' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Mensagem
              </label>
              <textarea
                value={form.messageBody}
                onChange={e => setForm({ ...form, messageBody: e.target.value })}
                rows={5}
                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="Olá, {{nome_contato}}!"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
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
              </div>
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
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg shadow-sm disabled:opacity-50"
            >
              {createMutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Criar regra
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
            const actionCfg = rule.action_config as Record<string, unknown>;
            const actionDescription =
              rule.action_type === 'send_whatsapp'
                ? `Mensagem: "${String(actionCfg.body ?? '').slice(0, 60)}${String(actionCfg.body ?? '').length > 60 ? '…' : ''}"`
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
                    <span className="text-slate-400 dark:text-slate-500"> · {boardName}</span>
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
