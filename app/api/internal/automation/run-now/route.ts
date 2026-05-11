/**
 * POST /api/internal/automation/run-now
 *
 * Disparo imediato do processador de schedules. Chamado fire-and-forget
 * pelos triggers (onDealCreated/onStageEntered/onResponseReceived) e por
 * webhooks server-side, para que a automacao rode em < 2s ao inves de
 * esperar o cron de 15min.
 *
 * Dois modos de autenticacao (sem CRON_SECRET, ja que o cliente nao conhece):
 *
 * 1. Modo session — POST sem body (ou body vazio).
 *    Autentica via cookie/SSR, descobre organization_id do profile, processa
 *    APENAS schedules dessa org. Evita vazamento cross-org.
 *
 * 2. Modo schedule-id — POST { scheduleId }.
 *    Para chamadores server-side sem sessao (webhooks WAHA/Meta). Valida que
 *    a schedule existe, esta pending e foi agendada ha < 60s (janela curta
 *    impede replay). Processa apenas essa schedule.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { processAutomationSchedules } from '@/lib/automation/engine';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BodySchema = z.object({
  scheduleId: z.string().uuid().optional(),
}).strict();

export async function POST(request: Request) {
  // CSRF: rota usa cookie-auth (modo session) e dispara mutacao (CAS no schedule),
  // entao bloqueia origin externo. O modo schedule-id chamado por webhooks usa
  // server-side fetch (sem Origin) — isAllowedOrigin permite ausencia de Origin.
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let scheduleId: string | undefined;
  try {
    const text = await request.text();
    if (text) {
      const parsed = BodySchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues }, { status: 422 });
      }
      scheduleId = parsed.data.scheduleId;
    }
  } catch {
    // body invalido (nao-JSON) — segue modo session
  }

  // Modo schedule-id (server-side trigger)
  if (scheduleId) {
    const admin = createStaticAdminClient();
    const { data: schedule } = await admin
      .from('automation_schedules')
      .select('id, status, scheduled_at')
      .eq('id', scheduleId)
      .single();

    if (!schedule) {
      return NextResponse.json({ ok: false, error: 'Schedule not found' }, { status: 404 });
    }
    if (schedule.status !== 'pending') {
      return NextResponse.json({ ok: true, skipped: 'already_processed' });
    }
    // Janela curta — schedule criada ha < 60s (cron de 15min cobre o resto).
    const scheduledAtMs = new Date(schedule.scheduled_at as string).getTime();
    if (Number.isFinite(scheduledAtMs) && Date.now() - scheduledAtMs > 60_000) {
      return NextResponse.json({ ok: true, skipped: 'too_old' });
    }

    const result = await processAutomationSchedules({ scheduleId });
    return NextResponse.json({ ok: true, mode: 'schedule_id', ...result });
  }

  // Modo session (browser → triggers do useMoveDeal/dealsService.create)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const organizationId = profile?.organization_id;
  if (!organizationId) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  try {
    const result = await processAutomationSchedules({ organizationId });
    return NextResponse.json({ ok: true, mode: 'session', ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[automation/run-now] error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
