import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { testSmtpConnection } from '@/lib/communication/email';
import type { SmtpConfig } from '@/lib/communication/email';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await request.json() as SmtpConfig;
  if (!config.host) return NextResponse.json({ error: 'Missing host' }, { status: 422 });

  const result = await testSmtpConnection(config);
  return NextResponse.json(result);
}
