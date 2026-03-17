/**
 * GET /api/conversations
 *
 * Retorna lista paginada de conversas WhatsApp da organização do usuário
 * autenticado, ordenada por last_message_at DESC.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') ?? '0', 10);
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '50', 10), 100);
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('conversations')
    .select(
      'id, organization_id, contact_id, deal_id, channel, wa_chat_id, last_message_at, unread_count, created_at, updated_at, contacts(name, phone), deals(title)',
      { count: 'exact' }
    )
    .eq('organization_id', profile.organization_id)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [], totalCount: count ?? 0 });
}
