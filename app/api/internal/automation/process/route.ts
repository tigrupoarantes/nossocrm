/**
 * POST /api/internal/automation/process
 *
 * Endpoint chamado pelo Vercel Cron a cada 15 minutos.
 * Processa automation_schedules pendentes e executa as ações configuradas.
 *
 * Protegido por CRON_SECRET para evitar chamadas não autorizadas.
 */

import { NextResponse } from 'next/server';
import { processAutomationSchedules } from '@/lib/automation/engine';

export const runtime = 'nodejs';
export const maxDuration = 60; // até 60s (Vercel Pro+)

export async function POST(request: Request) {
  // Verificar segredo do cron
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processAutomationSchedules();

    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[automation/process] Fatal error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
