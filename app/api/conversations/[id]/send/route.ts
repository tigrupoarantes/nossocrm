/**
 * POST /api/conversations/[id]/send
 *
 * Envia mensagem WhatsApp via WAHA para a conversa especificada.
 * Persiste a mensagem outbound no banco e atualiza last_message_at.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { sendWahaMessage, toChatId } from '@/lib/communication/waha';
import type { WahaConfig } from '@/lib/communication/waha';

const SendSchema = z.object({
  body: z.string().min(1).max(4096),
});

export async function POST(
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

  // Verificar que a conversa pertence à org
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, wa_chat_id, organization_id')
    .eq('id', conversationId)
    .eq('organization_id', profile.organization_id)
    .single();

  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Validar body
  const parsed = SendSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 422 });
  }

  // Buscar configuração WAHA
  const { data: settings } = await supabase
    .from('organization_settings')
    .select('waha_config')
    .eq('organization_id', profile.organization_id)
    .single();

  const wahaConfig = (settings as Record<string, unknown>)?.waha_config as WahaConfig | null;
  if (!wahaConfig?.baseUrl) {
    return NextResponse.json({ error: 'WAHA not configured' }, { status: 422 });
  }

  // Extrair número do chatId: "5511999990000@c.us" → "+5511999990000"
  const phoneDigits = conv.wa_chat_id.replace(/@c\.us$/i, '');
  const phoneE164 = `+${phoneDigits}`;

  // Enviar via WAHA
  const result = await sendWahaMessage({
    to: phoneE164,
    body: parsed.data.body,
    wahaConfig,
  });

  const sentAt = new Date(result.timestamp * 1000).toISOString();

  // Persistir mensagem outbound
  const { data: message, error: msgError } = await supabase
    .from('messages')
    .insert({
      organization_id: profile.organization_id,
      conversation_id: conversationId,
      wa_message_id: result.id,
      direction: 'outbound',
      body: parsed.data.body,
      status: 'sent',
      sent_at: sentAt,
    })
    .select('*')
    .single();

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  // Atualizar last_message_at da conversa
  await supabase
    .from('conversations')
    .update({ last_message_at: sentAt })
    .eq('id', conversationId);

  return NextResponse.json({ ok: true, message });
}
