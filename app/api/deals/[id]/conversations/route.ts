/**
 * GET /api/deals/[id]/conversations
 *
 * Retorna todas as conversas de um deal, com suas mensagens,
 * agrupadas por canal. Usado pela aba "Conversas" no card do deal.
 *
 * Response: { data: ConversationWithMessages[] }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id: dealId } = await params;

  const supabase = await createClient();

  // Auth
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

  // Buscar conversas do deal
  const { data: conversations, error: convErr } = await supabase
    .from('conversations')
    .select(`
      id, channel, wa_chat_id, ig_conversation_id, fb_conversation_id,
      channel_metadata, last_message_at, unread_count, created_at, updated_at,
      contacts ( id, name, phone, email )
    `)
    .eq('deal_id', dealId)
    .eq('organization_id', profile.organization_id)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (convErr) {
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }

  if (!conversations || conversations.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // Buscar mensagens de todas as conversas
  const conversationIds = conversations.map(c => c.id);

  const { data: messages, error: msgErr } = await supabase
    .from('messages')
    .select(
      'id, conversation_id, channel, external_message_id, message_type, direction, body, media_url, status, sent_at, created_at, metadata'
    )
    .in('conversation_id', conversationIds)
    .order('sent_at', { ascending: true });

  if (msgErr) {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }

  // Agrupar mensagens por conversation_id
  const messagesByConv = new Map<string, typeof messages>();
  for (const msg of messages ?? []) {
    const convId = msg.conversation_id as string;
    if (!messagesByConv.has(convId)) messagesByConv.set(convId, []);
    messagesByConv.get(convId)!.push(msg);
  }

  // Montar resposta com mensagens embutidas
  const data = conversations.map(conv => ({
    ...conv,
    messages: messagesByConv.get(conv.id) ?? [],
  }));

  return NextResponse.json({ data });
}
