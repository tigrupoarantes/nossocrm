/**
 * POST /api/messages/send
 *
 * Endpoint unificado de envio de mensagens omnichannel.
 * Roteia automaticamente pelo canal da conversa (WhatsApp, Instagram, Facebook).
 *
 * Body: { conversationId, body, channel?, mediaUrl? }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { routeAndSendMessage } from '@/lib/communication/message-router';

export const runtime = 'nodejs';

const SendSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(4096),
  channel: z.enum(['whatsapp', 'instagram', 'facebook', 'email']).optional(),
  mediaUrl: z.string().url().optional(),
  replyToId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
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

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 });
  }

  const { conversationId, body: messageBody, channel, replyToId } = parsed.data;

  // Verificar que a conversa pertence à org do usuário
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, organization_id, channel')
    .eq('id', conversationId)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Rotear e enviar
  let routeResult: { ok: boolean; externalMessageId: string; channel: string };
  try {
    routeResult = await routeAndSendMessage(supabase, {
      conversationId,
      body: messageBody,
      channel: channel as 'whatsapp' | 'instagram' | 'facebook' | undefined,
      replyToId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    return NextResponse.json({ error: message }, { status: 422 });
  }

  // Persistir mensagem no banco
  const { data: message, error: insertErr } = await supabase
    .from('messages')
    .insert({
      organization_id: profile.organization_id,
      conversation_id: conversationId,
      external_message_id: routeResult.externalMessageId,
      channel: routeResult.channel,
      direction: 'outbound',
      body: messageBody,
      status: 'sent',
      message_type: 'text',
      reply_to_id: replyToId ?? null,
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: 'Failed to persist message' }, { status: 500 });
  }

  // Atualizar last_message_at da conversa
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  return NextResponse.json({ ok: true, message });
}
