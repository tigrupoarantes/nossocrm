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

const SendSchema = z
  .object({
    conversationId: z.string().uuid(),
    // body pode ser vazio quando há mídia (ex: áudio sem caption)
    body: z.string().max(4096).optional().default(''),
    channel: z.enum(['whatsapp', 'instagram', 'facebook', 'email']).optional(),
    mediaUrl: z.string().url().optional(),
    mediaType: z.enum(['image', 'audio', 'video', 'document']).optional(),
    filename: z.string().max(255).optional(),
    replyToId: z.string().uuid().optional(),
  })
  .refine(
    (v) => (v.body && v.body.length > 0) || !!v.mediaUrl,
    { message: 'Mensagem precisa de body ou mediaUrl' },
  )
  .refine(
    (v) => !v.mediaUrl || !!v.mediaType,
    { message: 'mediaUrl requer mediaType' },
  );

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

  const { conversationId, body: messageBody, channel, mediaUrl, mediaType, filename, replyToId } = parsed.data;

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
      mediaUrl,
      mediaType,
      filename,
      replyToId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    return NextResponse.json({ error: message }, { status: 422 });
  }

  // Persistir mensagem no banco (message_type reflete a mídia quando houver)
  const persistedMessageType = mediaType
    ? mediaType === 'document' ? 'file' : mediaType
    : 'text';

  const { data: message, error: insertErr } = await supabase
    .from('messages')
    .insert({
      organization_id: profile.organization_id,
      conversation_id: conversationId,
      external_message_id: routeResult.externalMessageId,
      // wa_message_id mirror do external_message_id — handler de message.ack
      // do WAHA busca por ambas as colunas, e mensagens inbound persistem em
      // wa_message_id também. Manter sincronizado evita lookup falhar.
      wa_message_id: routeResult.externalMessageId,
      channel: routeResult.channel,
      direction: 'outbound',
      body: messageBody,
      media_url: mediaUrl ?? null,
      status: 'sent',
      message_type: persistedMessageType,
      reply_to_id: replyToId ?? null,
      sent_at: new Date().toISOString(),
      metadata: filename ? { filename } : {},
    })
    .select()
    .single();

  if (insertErr) {
    console.error('[messages/send] insert failed', {
      organizationId: profile.organization_id,
      conversationId,
      code: insertErr.code,
      message: insertErr.message,
    });
    return NextResponse.json({ error: 'Failed to persist message' }, { status: 500 });
  }

  // Atualizar last_message_at da conversa
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  // Normaliza snake_case (Supabase) -> camelCase (tipo Message do projeto).
  // Idem ao /api/conversations/[id]/messages GET. Sem isso, useSendMessage
  // não consegue substituir a temp inline (ficaria com sentAt undefined).
  const m = message as Record<string, unknown>;
  const camelMessage = {
    id: m.id as string,
    organizationId: m.organization_id as string,
    conversationId: m.conversation_id as string,
    waMessageId: (m.wa_message_id as string | null) ?? null,
    externalMessageId: (m.external_message_id as string | null) ?? null,
    channel: (m.channel as string) ?? 'whatsapp',
    messageType: (m.message_type as string) ?? 'text',
    direction: m.direction as string,
    body: (m.body as string) ?? '',
    mediaUrl: (m.media_url as string | null) ?? null,
    status: m.status as string,
    sentAt: m.sent_at as string,
    createdAt: m.created_at as string,
    metadata: (m.metadata as Record<string, unknown> | null) ?? {},
  };

  return NextResponse.json({ ok: true, message: camelMessage });
}
