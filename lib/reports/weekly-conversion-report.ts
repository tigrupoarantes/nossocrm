/**
 * @fileoverview Relatório semanal de conversões por board.
 *
 * Calcula métricas dos últimos 7 dias (vs. 7 anteriores) para um board e
 * formata em três canais: WhatsApp (texto), email (HTML) e in-app (resumo).
 * Usado pelo cron `/api/internal/weekly-conversion-report` toda segunda 9h BRT.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface WeekRange {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

export interface BoardReport {
  boardId: string;
  boardName: string;
  range: WeekRange;
  current: PeriodMetrics;
  previous: PeriodMetrics;
}

export interface PeriodMetrics {
  createdCount: number;
  wonCount: number;
  lostCount: number;
  wonValue: number;
  conversionRate: number | null;
}

export function getLastWeekRange(now: Date = new Date()): WeekRange {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 7);
  const prevEnd = new Date(start);
  const prevStart = new Date(start);
  prevStart.setUTCDate(prevStart.getUTCDate() - 7);
  return { start, end, prevStart, prevEnd };
}

async function getMetrics(
  supabase: SupabaseClient,
  boardId: string,
  start: Date,
  end: Date,
): Promise<PeriodMetrics> {
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const { count: createdCount } = await supabase
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('board_id', boardId)
    .gte('created_at', startIso)
    .lt('created_at', endIso);

  const { data: wonRows } = await supabase
    .from('deals')
    .select('value')
    .eq('board_id', boardId)
    .eq('is_won', true)
    .gte('closed_at', startIso)
    .lt('closed_at', endIso);

  const wonCount = wonRows?.length ?? 0;
  const wonValue = (wonRows ?? []).reduce(
    (sum, d) => sum + Number((d as { value: number | null }).value ?? 0),
    0,
  );

  const { count: lostCount } = await supabase
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .eq('board_id', boardId)
    .eq('is_lost', true)
    .gte('closed_at', startIso)
    .lt('closed_at', endIso);

  const closedTotal = wonCount + (lostCount ?? 0);
  const conversionRate = closedTotal > 0 ? wonCount / closedTotal : null;

  return {
    createdCount: createdCount ?? 0,
    wonCount,
    lostCount: lostCount ?? 0,
    wonValue,
    conversionRate,
  };
}

export async function generateBoardReport(
  supabase: SupabaseClient,
  boardId: string,
  boardName: string,
  range: WeekRange = getLastWeekRange(),
): Promise<BoardReport> {
  const [current, previous] = await Promise.all([
    getMetrics(supabase, boardId, range.start, range.end),
    getMetrics(supabase, boardId, range.prevStart, range.prevEnd),
  ]);

  return { boardId, boardName, range, current, previous };
}

// =============================================================================
// Formatters
// =============================================================================

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fmtPct(v: number | null): string {
  if (v === null) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

function delta(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? '↑ novo' : '—';
  const diff = ((curr - prev) / prev) * 100;
  if (Math.abs(diff) < 1) return '≈';
  const arrow = diff > 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(diff).toFixed(0)}%`;
}

export function formatReportAsWhatsapp(report: BoardReport): string {
  const { boardName, range, current, previous } = report;
  const period = `${fmtDate(range.start)} a ${fmtDate(range.end)}`;
  return [
    `*Relatório semanal — ${boardName}*`,
    `_${period}_`,
    '',
    `🆕 Novos leads: *${current.createdCount}* (${delta(current.createdCount, previous.createdCount)})`,
    `✅ Ganhos: *${current.wonCount}* (${delta(current.wonCount, previous.wonCount)})`,
    `❌ Perdidos: *${current.lostCount}* (${delta(current.lostCount, previous.lostCount)})`,
    `💰 Valor ganho: *${fmtBRL(current.wonValue)}*`,
    `📊 Taxa de conversão: *${fmtPct(current.conversionRate)}* (semana anterior: ${fmtPct(previous.conversionRate)})`,
    '',
    'Bom trabalho! 🚀',
  ].join('\n');
}

export function formatReportAsEmailHtml(report: BoardReport, appUrl?: string): {
  subject: string;
  html: string;
} {
  const { boardId, boardName, range, current, previous } = report;
  const period = `${fmtDate(range.start)} a ${fmtDate(range.end)}`;
  const subject = `Relatório semanal — ${boardName} (${period})`;
  const link = appUrl ? `${appUrl.replace(/\/$/, '')}/boards/${boardId}` : null;

  const row = (label: string, value: string, sub?: string) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#475569;">${label}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:18px;font-weight:600;color:#0f172a;text-align:right;">
        ${value}${sub ? `<div style="font-size:12px;font-weight:400;color:#64748b;">${sub}</div>` : ''}
      </td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
    <div style="padding:24px;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;">
      <div style="font-size:13px;opacity:0.85;text-transform:uppercase;letter-spacing:0.5px;">Relatório semanal</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px;">${boardName}</div>
      <div style="font-size:13px;opacity:0.85;margin-top:4px;">${period}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      ${row('🆕 Novos leads', String(current.createdCount), `vs. anterior: ${delta(current.createdCount, previous.createdCount)}`)}
      ${row('✅ Ganhos', String(current.wonCount), `vs. anterior: ${delta(current.wonCount, previous.wonCount)}`)}
      ${row('❌ Perdidos', String(current.lostCount), `vs. anterior: ${delta(current.lostCount, previous.lostCount)}`)}
      ${row('💰 Valor ganho', fmtBRL(current.wonValue))}
      ${row('📊 Taxa de conversão', fmtPct(current.conversionRate), `semana anterior: ${fmtPct(previous.conversionRate)}`)}
    </table>
    ${link ? `<div style="padding:20px 24px;text-align:center;"><a href="${link}" style="display:inline-block;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Abrir board</a></div>` : ''}
    <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:12px;color:#94a3b8;text-align:center;">
      Você recebe este relatório porque é o gestor deste board no NossoCRM.
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

export function formatReportAsInApp(report: BoardReport): {
  title: string;
  message: string;
  link: string;
} {
  const { boardId, boardName, current, previous } = report;
  const title = `Relatório semanal: ${boardName}`;
  const message = `${current.createdCount} novos leads • ${current.wonCount} ganhos • ${fmtBRL(current.wonValue)} • conversão ${fmtPct(current.conversionRate)} (${delta(current.conversionRate ?? 0, previous.conversionRate ?? 0)})`;
  return { title, message, link: `/boards/${boardId}` };
}
