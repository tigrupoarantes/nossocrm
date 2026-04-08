/**
 * GET /api/conversations/[id]/messages
 *
 * Retorna mensagens de uma conversa, paginadas e ordenadas por sent_at ASC.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: conversationId } = await params;

  // Verificar que a conversa pertence à org do usuário
  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') ?? '0', 10);
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '100', 10), 200);
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('messages')
    .select('*', { count: 'exact' })
    .eq('conversation_id', conversationId)
    .eq('organization_id', profile.organization_id)
    .order('sent_at', { ascending: true })
    .range(from, to);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Normaliza snake_case (Supabase) -> camelCase (tipo Message do projeto).
  // Sem isso, componentes que leem `message.sentAt` recebem undefined e
  // renderizam "Invalid Date".
  const mapped = (data ?? []).map((m) => ({
    id: m.id,
    organizationId: m.organization_id,
    conversationId: m.conversation_id,
    externalMessageId: m.external_message_id ?? m.wa_message_id ?? null,
    channel: m.channel ?? 'whatsapp',
    messageType: m.message_type ?? 'text',
    direction: m.direction,
    body: m.body ?? '',
    mediaUrl: m.media_url ?? null,
    status: m.status,
    sentAt: m.sent_at,
    createdAt: m.created_at,
    metadata: m.metadata ?? {},
  }));

  return NextResponse.json({ data: mapped, totalCount: count ?? 0 });
}
