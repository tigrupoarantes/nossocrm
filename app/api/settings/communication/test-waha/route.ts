import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { testWahaConnection } from '@/lib/communication/waha';
import type { WahaConfig } from '@/lib/communication/waha';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await request.json() as WahaConfig;
  if (!config.baseUrl) return NextResponse.json({ error: 'Missing baseUrl' }, { status: 422 });

  const result = await testWahaConnection(config);
  return NextResponse.json(result);
}
