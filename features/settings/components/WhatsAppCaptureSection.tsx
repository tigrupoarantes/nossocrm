'use client';

import { useEffect, useMemo, useState } from 'react';
import { Inbox, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { boardsService } from '@/lib/supabase/boards';
import type { Board } from '@/types';

/**
 * Configura o board+stage onde leads que chegam por WhatsApp inbound (numero
 * desconhecido) sao automaticamente cadastrados como deal e ja entram na
 * cadencia configurada via Automacoes.
 *
 * Sem essa config, o webhook persiste a mensagem mas nao cria deal — entao
 * a automacao do tipo "deal_created" nunca dispara para esses leads.
 */
export function WhatsAppCaptureSection() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState<string>('');
  const [stageId, setStageId] = useState<string>('');
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/communication').then(r => r.json()),
      boardsService.getAll(),
    ])
      .then(([settings, boardsRes]) => {
        const capture = settings?.whatsappCapture;
        if (capture) {
          setBoardId(capture.boardId ?? '');
          setStageId(capture.stageId ?? '');
        }
        setConfigured(Boolean(settings?.configured?.whatsappCapture));
        setBoards(boardsRes.data ?? []);
      })
      .catch(() => addToast('Erro ao carregar configuração de captura', 'error'))
      .finally(() => setLoading(false));
  }, [addToast]);

  const selectedBoard = useMemo(
    () => boards.find(b => b.id === boardId),
    [boards, boardId],
  );

  const handleBoardChange = (newBoardId: string) => {
    setBoardId(newBoardId);
    setStageId(''); // reset stage quando muda o board
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = boardId && stageId
        ? { whatsappCapture: { boardId, stageId } }
        : { whatsappCapture: null };

      const res = await fetch('/api/settings/communication', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? 'Falha ao salvar');
      }

      setConfigured(Boolean(boardId && stageId));
      addToast(
        boardId && stageId
          ? 'Captura WhatsApp ativada — novos leads viram deals automaticamente'
          : 'Captura WhatsApp desativada',
        'success',
      );
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-slate-200 dark:border-white/10 rounded-xl p-5 flex items-center gap-3 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="border border-slate-200 dark:border-white/10 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          <span className="font-medium text-slate-900 dark:text-white text-sm">
            Captura automática de leads via WhatsApp
          </span>
        </div>
        {configured ? (
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <CheckCircle className="h-3.5 w-3.5" /> Ativada
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <XCircle className="h-3.5 w-3.5" /> Desativada
          </span>
        )}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        Quando um lead manda mensagem de um número desconhecido (sem deal ativo),
        o sistema cria automaticamente um contato e um deal no board e coluna
        configurados abaixo. Isso dispara as regras de automação com gatilho{' '}
        <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-[11px]">
          deal_created
        </code>{' '}
        — incluindo envio de WhatsApp e e-mail de cadência.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Board (funil) de captura
          </label>
          <select
            value={boardId}
            onChange={(e) => handleBoardChange(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">— desativado —</option>
            {boards.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Coluna inicial
          </label>
          <select
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            disabled={!selectedBoard}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white disabled:opacity-50 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">— selecionar —</option>
            {selectedBoard?.stages.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || (boardId !== '' && stageId === '')}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Salvar
        </button>
      </div>
    </div>
  );
}
