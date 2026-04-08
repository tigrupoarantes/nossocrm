'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Play, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Activity } from 'lucide-react';

interface WebhookLog {
  id: string;
  source: string;
  method: string;
  status_code: number;
  payload: Record<string, unknown>;
  result: {
    object?: string | null;
    statusUpdates?: number;
    inboundProcessed?: number;
    inboundDropped?: number;
    droppedReasons?: string[];
    errors?: string[];
    organizationIds?: string[];
  };
  error_message: string | null;
  created_at: string;
  organization_id: string | null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function StatusBadge({ log }: { log: WebhookLog }) {
  const r = log.result ?? {};
  const processed = r.inboundProcessed ?? 0;
  const dropped = r.inboundDropped ?? 0;
  const status = r.statusUpdates ?? 0;

  if (log.error_message || log.status_code >= 500) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-300 border border-red-500/30">
        <AlertCircle size={10} /> ERRO
      </span>
    );
  }
  if (processed > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-300 border border-green-500/30">
        <CheckCircle2 size={10} /> {processed} processada{processed > 1 ? 's' : ''}
      </span>
    );
  }
  if (dropped > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
        <AlertCircle size={10} /> {dropped} dropada{dropped > 1 ? 's' : ''}
      </span>
    );
  }
  if (status > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-sky-500/20 text-sky-300 border border-sky-500/30">
        <Activity size={10} /> {status} status
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-500/20 text-slate-400 border border-slate-500/30">
      vazio
    </span>
  );
}

function LogRow({ log }: { log: WebhookLog }) {
  const [expanded, setExpanded] = useState(false);
  const r = log.result ?? {};
  const droppedReasons = r.droppedReasons ?? [];
  const errors = r.errors ?? [];

  return (
    <div className="border-b border-slate-200 dark:border-white/10">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors flex items-start gap-3"
      >
        <div className="shrink-0 mt-0.5 text-slate-400">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {formatDateTime(log.created_at)}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 font-medium">
              {log.source}
            </span>
            <StatusBadge log={log} />
          </div>
          {log.error_message && (
            <p className="text-xs text-red-400 mt-1">{log.error_message}</p>
          )}
          {droppedReasons.length > 0 && (
            <p className="text-xs text-amber-400/80 mt-1">
              Motivos drop: {droppedReasons.join(', ')}
            </p>
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-10 pb-3 space-y-3 bg-slate-50/50 dark:bg-black/20">
          {errors.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-400 mb-1">Erros</p>
              <ul className="list-disc list-inside text-xs text-red-300 space-y-0.5">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Resultado</p>
            <pre className="text-[10px] font-mono p-2 bg-white dark:bg-black/40 rounded border border-slate-200 dark:border-white/10 overflow-x-auto text-slate-700 dark:text-slate-300">
              {JSON.stringify(r, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Payload recebido</p>
            <pre className="text-[10px] font-mono p-2 bg-white dark:bg-black/40 rounded border border-slate-200 dark:border-white/10 overflow-x-auto max-h-64 text-slate-700 dark:text-slate-300">
              {JSON.stringify(log.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function DiagnosticoPage() {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('Mensagem de teste do simulador');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'meta-whatsapp' | 'waha'>('all');

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery<WebhookLog[]>({
    queryKey: ['webhook-logs', sourceFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      const res = await fetch(`/api/settings/webhook-logs?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json() as { data: WebhookLog[] };
      return data.data ?? [];
    },
    refetchInterval: 5_000,
  });

  const simulateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/settings/webhook-logs/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone || undefined, message: message || undefined }),
      });
      const data = await res.json() as { ok: boolean; webhookStatus?: number; error?: string; hint?: string };
      if (!res.ok) throw new Error(data.error ?? `Simulate failed: ${res.status}`);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['webhook-logs'] });
    },
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Diagnóstico de Webhooks</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Toda chegada de webhook (Meta WhatsApp Cloud API ou WAHA) aparece aqui em até 5 segundos.
          Se mensagens estão chegando no seu WhatsApp mas a tela /omnichannel não está atualizando,
          este é o lugar para descobrir o motivo.
        </p>
      </div>

      {/* Simulador */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
          Simular mensagem inbound
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Dispara uma mensagem fake no formato exato do provider configurado (detecta automaticamente
          Meta ou WAHA). Se o simulador funciona mas mensagens reais não chegam, o problema é na
          configuração do webhook do lado do provider (URL apontando errado, secret divergente, etc.).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Telefone (com DDI, só números)
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="5511999999999"
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Mensagem
            </label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => simulateMutation.mutate()}
          disabled={simulateMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
        >
          <Play size={14} />
          {simulateMutation.isPending ? 'Disparando...' : 'Simular inbound'}
        </button>
        {simulateMutation.isError && (
          <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            {(simulateMutation.error as Error).message}
          </div>
        )}
        {simulateMutation.isSuccess && (
          <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-xs text-green-300">
            Webhook disparado com status {simulateMutation.data?.webhookStatus ?? '?'}. O log deve aparecer abaixo em segundos.
          </div>
        )}
      </div>

      {/* Lista de logs */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-white/10 flex-wrap gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Últimas chegadas de webhooks
          </h2>
          <div className="flex items-center gap-2">
            {(['all', 'meta-whatsapp', 'waha'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSourceFilter(s)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  sourceFilter === s
                    ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/30'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                {s === 'all' ? 'Todos' : s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors"
            >
              <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-400">Carregando...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Nenhum webhook recebido ainda. Clique em <strong>Simular inbound</strong> para gerar um teste,
            ou peça pra alguém responder no WhatsApp.
          </div>
        ) : (
          <div>
            {logs.map((log) => <LogRow key={log.id} log={log} />)}
          </div>
        )}
      </div>
    </div>
  );
}
