/**
 * GET/POST/DELETE /api/settings/communication/waha-session
 *
 * Gerencia a sessão WAHA (status, QR, iniciar, encerrar).
 * Apenas admins da organização.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getWahaSessionStatus, getWahaQrCode } from '@/lib/communication/waha';
import type { WahaConfig, WahaQrCode } from '@/lib/communication/waha';

export const runtime = 'nodejs';

async function getAdminAndConfig(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 } as const;

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return { error: 'Admin only', status: 403 } as const;
  }

  const { data: settings } = await supabase
    .from('organization_settings')
    .select('waha_config')
    .eq('organization_id', profile.organization_id)
    .single();

  const wahaConfig = (settings as Record<string, unknown>)?.waha_config as WahaConfig | null;
  if (!wahaConfig?.baseUrl) {
    return { error: 'WAHA not configured', status: 422 } as const;
  }

  return { wahaConfig, organizationId: profile.organization_id };
}

export async function GET() {
  const supabase = await createClient();
  const result = await getAdminAndConfig(supabase);

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { wahaConfig } = result;
  const sessionInfo = await getWahaSessionStatus(wahaConfig);

  let qr: WahaQrCode | null = null;
  if (sessionInfo.status === 'SCAN_QR_CODE') {
    qr = await getWahaQrCode(wahaConfig);
  }

  return NextResponse.json({ status: sessionInfo, qr });
}

export async function POST() {
  const supabase = await createClient();
  const result = await getAdminAndConfig(supabase);

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { wahaConfig } = result;
  const url = `${wahaConfig.baseUrl}/api/sessions/${wahaConfig.sessionName}/start`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': wahaConfig.apiKey,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { message?: string };
      return NextResponse.json({ error: err.message ?? `HTTP ${response.status}` }, { status: 422 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start session' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const supabase = await createClient();
  const result = await getAdminAndConfig(supabase);

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { wahaConfig } = result;
  const url = `${wahaConfig.baseUrl}/api/sessions/${wahaConfig.sessionName}`;

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'x-api-key': wahaConfig.apiKey },
    });

    if (!response.ok) {
      return NextResponse.json({ error: `HTTP ${response.status}` }, { status: 422 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to stop session' },
      { status: 500 }
    );
  }
}
