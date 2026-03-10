'use client';

import React from 'react';
import { CheckCircle2, XCircle, Loader2, Bot, Mail, MessageCircle, MoveRight, Search, Users, Clock } from 'lucide-react';
import { useAutomationHistory } from '../hooks/useAutomationHistory';

interface AutomationHistoryPanelProps {
  dealId: string;
  className?: string;
}

const ACTION_LABELS: Record<string, string> = {
  send_email: 'E-mail enviado',
  send_whatsapp: 'WhatsApp enviado',
  move_stage: 'Stage alterado',
  move_to_next_board: 'Movido ao próximo funil',
  validate_cnpj: 'Validação CNPJ',
  check_serasa: 'Consulta SERASA',
  check_customer_base: 'Verificação base FLAG/SAP',
};

function ActionIcon({ type }: { type: string }) {
  switch (type) {
    case 'send_email':
      return <Mail className="h-3.5 w-3.5" />;
    case 'send_whatsapp':
      return <MessageCircle className="h-3.5 w-3.5" />;
    case 'move_stage':
    case 'move_to_next_board':
      return <MoveRight className="h-3.5 w-3.5" />;
    case 'validate_cnpj':
      return <Search className="h-3.5 w-3.5" />;
    case 'check_serasa':
    case 'check_customer_base':
      return <Users className="h-3.5 w-3.5" />;
    default:
      return <Bot className="h-3.5 w-3.5" />;
  }
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ResultSummary({ result }: { result: Record<string, unknown> | null }) {
  if (!result) return null;

  const entries = Object.entries(result).filter(([k]) => k !== 'error');
  if (entries.length === 0) return null;

  const summary = entries
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');

  return (
    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-500 truncate" title={summary}>
      {summary}
    </p>
  );
}

export function AutomationHistoryPanel({ dealId, className }: AutomationHistoryPanelProps) {
  const { data: executions, isLoading, error } = useAutomationHistory(dealId);

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-slate-400 ${className ?? ''}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando histórico…
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-sm text-red-400 ${className ?? ''}`}>
        Erro ao carregar histórico de automações.
      </div>
    );
  }

  if (!executions || executions.length === 0) {
    return (
      <div className={`flex flex-col items-center gap-2 py-8 text-sm text-slate-400 dark:text-slate-500 ${className ?? ''}`}>
        <Clock className="h-8 w-8 opacity-40" />
        <span>Nenhuma automação executada ainda.</span>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      {executions.map((exec) => (
        <div
          key={exec.id}
          className="flex items-start gap-3 rounded-xl border border-slate-100 dark:border-white/8 bg-white dark:bg-white/3 p-3"
        >
          {/* Icon + status */}
          <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            exec.success
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400'
          }`}>
            <ActionIcon type={exec.actionType} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                {ACTION_LABELS[exec.actionType] ?? exec.actionType}
              </p>
              {exec.success ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
              )}
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {exec.ruleName}
            </p>

            {exec.success ? (
              <ResultSummary result={exec.result} />
            ) : (
              <p className="mt-0.5 text-[11px] text-red-400 truncate">
                {(exec.result as any)?.error ?? 'Erro desconhecido'}
              </p>
            )}
          </div>

          <time className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
            {formatDate(exec.executedAt)}
          </time>
        </div>
      ))}
    </div>
  );
}
