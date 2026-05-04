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
  // Cursor-mode (scroll infinito): retorna até `limit` mensagens ANTERIORES
  // a `before` ordenadas por sent_at DESC, depois invertidas para ASC. Usa
  // o índice idx_messages_conversation (conversation_id, sent_at DESC).
  const before = url.searchParams.get('before');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);

  if (before) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('organization_id', profile.organization_id)
      .lt('sent_at', before)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const mapped = (data ?? []).reverse().map(mapMessage);
    return NextResponse.json({ data: mapped, hasMore: (data?.length ?? 0) === limit });
  }

  // Modo legado paginado por offset (mantido para compat com chamadas antigas).
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
  const mapped = (data ?? []).map(mapMessage);

  return NextResponse.json({ data: mapped, totalCount: count ?? 0 });
}

// Mapper extraído para reuso entre modo cursor e modo offset.
function mapMessage(m: Record<string, unknown>) {
  return {
    id: m.id,
    organizationId: m.organization_id,
    conversationId: m.conversation_id,
    externalMessageId: (m.external_message_id ?? m.wa_message_id ?? null) as string | null,
    channel: (m.channel ?? 'whatsapp') as string,
    messageType: (m.message_type ?? 'text') as string,
    direction: m.direction as string,
    body: (m.body ?? '') as string,
    mediaUrl: (m.media_url ?? null) as string | null,
    status: m.status as string,
    sentAt: m.sent_at as string,
    createdAt: m.created_at as string,
    metadata: (m.metadata ?? {}) as Record<string, unknown>,
  };
}
