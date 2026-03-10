import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { testTwilioCredentials } from '@/lib/communication/whatsapp';
import type { TwilioConfig } from '@/lib/communication/whatsapp';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await request.json() as TwilioConfig;
  if (!config.accountSid) return NextResponse.json({ error: 'Missing accountSid' }, { status: 422 });

  const result = await testTwilioCredentials(config);
  return NextResponse.json(result);
}
