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

  // Transformar mensagens snake_case → camelCase para alinhar com o tipo `Message`
  // usado no client (MessageBubble lê `mediaUrl`, `messageType`, etc).
  const normalizedMessages = (messages ?? []).map(msg => ({
    id: msg.id,
    conversationId: msg.conversation_id,
    channel: msg.channel,
    externalMessageId: msg.external_message_id,
    messageType: msg.message_type,
    direction: msg.direction,
    body: msg.body,
    mediaUrl: msg.media_url,
    status: msg.status,
    sentAt: msg.sent_at,
    createdAt: msg.created_at,
    metadata: msg.metadata,
  }));

  // Agrupar mensagens por conversationId
  const messagesByConv = new Map<string, typeof normalizedMessages>();
  for (const msg of normalizedMessages) {
    const convId = msg.conversationId as string;
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

// =============================================================================
// POST /api/deals/[id]/conversations
// Cria nova conversa + envia primeira mensagem (proactive outbound)
// Body: { channel: ConversationChannel, body: string }
// =============================================================================

export async function POST(req: Request, { params }: RouteParams) {
  const { id: dealId } = await params;

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

  let body: { channel?: string; text?: string };
  try {
    body = await req.json() as { channel?: string; text?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const channel = (body.channel ?? 'whatsapp') as string;
  const text = body.text ?? '';

  if (!text.trim()) {
    return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
  }

  if (!['whatsapp', 'instagram', 'facebook', 'email'].includes(channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
  }

  // Buscar deal + contato para obter telefone / IDs externos
  const { data: deal, error: dealErr } = await supabase
    .from('deals')
    .select('id, contact_id, contacts ( id, name, phone )')
    .eq('id', dealId)
    .eq('organization_id', profile.organization_id)
    .single();

  if (dealErr) {
    console.error('[conversations/POST] deal fetch error:', dealErr);
  }

  if (!deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  type ContactRow = { id: string; name: string; phone: string | null };
  const contactsRaw = deal.contacts as ContactRow | ContactRow[] | null;
  const contact = Array.isArray(contactsRaw) ? (contactsRaw[0] ?? null) : contactsRaw;

  if (!contact) {
    return NextResponse.json({ error: 'Deal has no contact' }, { status: 422 });
  }

  // Para WhatsApp: o destinatário é o telefone do contato
  if (channel === 'whatsapp' && !contact.phone) {
    return NextResponse.json({ error: 'Contact has no phone number for WhatsApp' }, { status: 422 });
  }

  // Derivar wa_chat_id a partir do telefone do contato
  const waChatId = channel === 'whatsapp' && contact.phone
    ? contact.phone.replace(/\D/g, '') + '@c.us'
    : null;

  console.log('[conversations/POST] dealId=%s channel=%s waChatId=%s contactId=%s', dealId, channel, waChatId, contact.id);

  // Buscar conversa existente por wa_chat_id (unique constraint) OU por deal+canal
  let conversationId: string;

  if (waChatId) {
    // Para WhatsApp: buscar pela chave única real (organization_id, wa_chat_id)
    const { data: existingByChat } = await supabase
      .from('conversations')
      .select('id, deal_id')
      .eq('organization_id', profile.organization_id)
      .eq('wa_chat_id', waChatId)
      .maybeSingle();

    if (existingByChat) {
      conversationId = existingByChat.id;
      // Se a conversa existe mas pertence a outro deal, vincular a este deal também
      if (existingByChat.deal_id !== dealId) {
        console.log('[conversations/POST] reusing conversation %s (was deal %s, now also %s)', existingByChat.id, existingByChat.deal_id, dealId);
        await supabase
          .from('conversations')
          .update({ deal_id: dealId })
          .eq('id', existingByChat.id);
      }
    } else {
      // Criar nova conversa
      const { data: newConv, error: createErr } = await supabase
        .from('conversations')
        .insert({
          organization_id: profile.organization_id,
          contact_id: contact.id,
          deal_id: dealId,
          channel,
          wa_chat_id: waChatId,
          unread_count: 0,
          channel_metadata: {},
        })
        .select('id')
        .single();

      if (createErr || !newConv) {
        console.error('[conversations/POST] create conversation error:', createErr);
        return NextResponse.json({ error: 'Failed to create conversation', detail: createErr?.message }, { status: 500 });
      }

      conversationId = newConv.id;
    }
  } else {
    // Non-WhatsApp: buscar por deal + canal
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('deal_id', dealId)
      .eq('organization_id', profile.organization_id)
      .eq('channel', channel)
      .maybeSingle();

    if (existing) {
      conversationId = existing.id;
    } else {
      const { data: newConv, error: createErr } = await supabase
        .from('conversations')
        .insert({
          organization_id: profile.organization_id,
          contact_id: contact.id,
          deal_id: dealId,
          channel,
          unread_count: 0,
          channel_metadata: {},
        })
        .select('id')
        .single();

      if (createErr || !newConv) {
        console.error('[conversations/POST] create conversation error:', createErr);
        return NextResponse.json({ error: 'Failed to create conversation', detail: createErr?.message }, { status: 500 });
      }

      conversationId = newConv.id;
    }
  }

  // Enviar mensagem via router omnichannel
  const { routeAndSendMessage } = await import('@/lib/communication/message-router');

  let externalMessageId: string;
  try {
    const result = await routeAndSendMessage(supabase, {
      conversationId,
      body: text,
      channel: channel as 'whatsapp' | 'instagram' | 'facebook' | 'email',
    });
    externalMessageId = result.externalMessageId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Send failed';
    console.error('[conversations/POST] routeAndSendMessage error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Persistir mensagem
  const now = new Date().toISOString();
  const { data: message, error: msgErr } = await supabase
    .from('messages')
    .insert({
      organization_id: profile.organization_id,
      conversation_id: conversationId,
      channel,
      external_message_id: externalMessageId,
      message_type: 'text',
      direction: 'outbound',
      body: text,
      status: 'sent',
      sent_at: now,
      metadata: {},
    })
    .select()
    .single();

  if (msgErr) {
    console.error('[conversations/POST] insert message error:', msgErr);
    return NextResponse.json({ error: 'Failed to persist message', detail: msgErr.message }, { status: 500 });
  }

  // Atualizar last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: now })
    .eq('id', conversationId);

  console.log('[conversations/POST] success: convId=%s msgId=%s', conversationId, message?.id);
  return NextResponse.json({ ok: true, conversationId, message }, { status: 201 });
}
