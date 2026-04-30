/**
 * POST /api/internal/weekly-conversion-report
 *
 * Cron Vercel — toda segunda-feira 9h BRT (12h UTC).
 * Para cada board com `owner_id`, calcula métricas dos últimos 7 dias e
 * envia ao gestor por: in-app (sempre), email (se SMTP configurado),
 * WhatsApp via WAHA (se configurado e gestor tem telefone).
 *
 * Auth: header `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextResponse } from 'next/server';
import { createStaticAdminClient } from '@/lib/supabase/server';
import {
  generateBoardReport,
  formatReportAsWhatsapp,
  formatReportAsEmailHtml,
  formatReportAsInApp,
  getLastWeekRange,
} from '@/lib/reports/weekly-conversion-report';
import { sendEmail, type SmtpConfig } from '@/lib/communication/email';
import { sendWahaMessage } from '@/lib/communication/waha';

export const runtime = 'nodejs';
export const maxDuration = 300; // até 5min — pode iterar várias orgs/boards

interface ChannelOutcome {
  ok: boolean;
  error?: string;
}

interface BoardOutcome {
  boardId: string;
  boardName: string;
  ownerId: string;
  inApp: ChannelOutcome;
  email: ChannelOutcome | null;
  whatsapp: ChannelOutcome | null;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createStaticAdminClient();
    const range = getLastWeekRange();

    // Lista boards ativos com gestor designado.
    const { data: boards, error: boardsError } = await supabase
      .from('boards')
      .select('id, name, organization_id, owner_id')
      .is('deleted_at', null)
      .not('owner_id', 'is', null);

    if (boardsError) {
      console.error('[weekly-report] failed to list boards', boardsError);
      return NextResponse.json({ ok: false, error: boardsError.message }, { status: 500 });
    }

    const outcomes: BoardOutcome[] = [];
    const orgSettingsCache = new Map<string, {
      smtpConfig: SmtpConfig | null;
      wahaConfig: { baseUrl: string; apiKey: string; sessionName: string } | null;
    }>();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;

    for (const board of (boards ?? []) as Array<{
      id: string;
      name: string;
      organization_id: string;
      owner_id: string;
    }>) {
      const outcome: BoardOutcome = {
        boardId: board.id,
        boardName: board.name,
        ownerId: board.owner_id,
        inApp: { ok: false },
        email: null,
        whatsapp: null,
      };

      // Owner profile (email/phone/name).
      const { data: owner } = await supabase
        .from('profiles')
        .select('id, email, phone, name')
        .eq('id', board.owner_id)
        .maybeSingle();

      // Org settings (cached por org).
      let orgSettings = orgSettingsCache.get(board.organization_id);
      if (!orgSettings) {
        const { data: settings } = await supabase
          .from('organization_settings')
          .select('smtp_config, waha_config')
          .eq('organization_id', board.organization_id)
          .maybeSingle();
        orgSettings = {
          smtpConfig: ((settings as Record<string, unknown> | null)?.smtp_config as SmtpConfig | null) ?? null,
          wahaConfig: ((settings as Record<string, unknown> | null)?.waha_config as {
            baseUrl: string;
            apiKey: string;
            sessionName: string;
          } | null) ?? null,
        };
        orgSettingsCache.set(board.organization_id, orgSettings);
      }

      let report;
      try {
        report = await generateBoardReport(supabase, board.id, board.name, range);
      } catch (e) {
        outcome.inApp = { ok: false, error: (e as Error).message };
        outcomes.push(outcome);
        continue;
      }

      // 1) In-app (sempre).
      const inApp = formatReportAsInApp(report);
      const { error: inAppErr } = await supabase.from('system_notifications').insert({
        organization_id: board.organization_id,
        type: 'weekly_report',
        title: inApp.title,
        message: inApp.message,
        link: inApp.link,
        severity: 'low',
      });
      outcome.inApp = inAppErr ? { ok: false, error: inAppErr.message } : { ok: true };

      // 2) Email (se SMTP configurado e owner tem email).
      if (orgSettings.smtpConfig?.host && owner?.email) {
        try {
          const { subject, html } = formatReportAsEmailHtml(report, appUrl);
          await sendEmail({
            to: owner.email,
            subject,
            html,
            smtpConfig: orgSettings.smtpConfig,
          });
          outcome.email = { ok: true };
        } catch (e) {
          outcome.email = { ok: false, error: (e as Error).message };
        }
      }

      // 3) WhatsApp (se WAHA configurado e owner tem telefone).
      if (orgSettings.wahaConfig?.baseUrl && owner?.phone) {
        try {
          const body = formatReportAsWhatsapp(report);
          await sendWahaMessage({
            to: owner.phone,
            body,
            wahaConfig: orgSettings.wahaConfig,
          });
          outcome.whatsapp = { ok: true };
        } catch (e) {
          outcome.whatsapp = { ok: false, error: (e as Error).message };
        }
      }

      outcomes.push(outcome);
    }

    const summary = {
      processed: outcomes.length,
      inAppOk: outcomes.filter(o => o.inApp.ok).length,
      emailOk: outcomes.filter(o => o.email?.ok).length,
      whatsappOk: outcomes.filter(o => o.whatsapp?.ok).length,
    };

    return NextResponse.json({
      ok: true,
      summary,
      outcomes,
      range: {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[weekly-conversion-report] Fatal error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Vercel Cron padrão dispara GET. Aceitamos GET delegando pro mesmo handler.
export async function GET(request: Request) {
  return POST(request);
}
