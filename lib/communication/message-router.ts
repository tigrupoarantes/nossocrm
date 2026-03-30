/**
 * Message Router — Roteador de envio omnichannel
 *
 * Abstração central para envio de mensagens independente do canal.
 * Decide qual adapter usar com base no campo `channel` da conversa.
 *
 * Canais suportados:
 * - 'whatsapp' → WAHA (lib/communication/waha.ts)
 * - 'instagram' → Meta Graph API (lib/communication/meta-instagram.ts) [Fase 3]
 * - 'facebook'  → Meta Graph API (lib/communication/meta-facebook.ts) [Fase 3]
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConversationChannel } from '@/types';

// =============================================================================
// Types
// =============================================================================

export interface RouteMessageParams {
  /** ID da conversa no banco (para buscar canal, chat ID e config) */
  conversationId: string;
  /** Texto da mensagem */
  body: string;
  /** Canal a usar — se omitido, usa o canal da conversa */
  channel?: ConversationChannel;
  /** URL de mídia opcional (imagem, vídeo, etc.) */
  mediaUrl?: string;
  /** ID de mensagem à qual esta é uma resposta */
  replyToId?: string;
}

export interface RouteMessageResult {
  ok: boolean;
  externalMessageId: string;
  channel: ConversationChannel;
}

// =============================================================================
// Router principal
// =============================================================================

/**
 * Roteia e envia uma mensagem pelo canal correto.
 * Busca a conversa no banco para obter canal, destinatário e configuração do org.
 */
export async function routeAndSendMessage(
  supabase: SupabaseClient,
  params: RouteMessageParams,
): Promise<RouteMessageResult> {
  // 1) Buscar conversa + org settings
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, organization_id, channel, wa_chat_id, ig_conversation_id, fb_conversation_id')
    .eq('id', params.conversationId)
    .single();

  if (convErr || !conv) {
    throw new Error(`Conversation not found: ${params.conversationId}`);
  }

  const channel: ConversationChannel = params.channel ?? (conv.channel as ConversationChannel);

  const { data: settings } = await supabase
    .from('organization_settings')
    .select('waha_config, meta_config, meta_whatsapp_config')
    .eq('organization_id', conv.organization_id)
    .single();

  // 2) Despachar para o adapter correto
  switch (channel) {
    case 'whatsapp': {
      const waChatId = conv.wa_chat_id as string | null;
      if (!waChatId) {
        throw new Error('Conversation has no wa_chat_id');
      }

      // Extrair número do chatId (ex.: "5511999990000@c.us" → "+5511999990000")
      const phoneDigits = waChatId.replace(/@[cs]\.us$/i, '').replace(/@s\.whatsapp\.net$/i, '').replace(/\D/g, '');
      const phone = `+${phoneDigits}`;

      const metaConfig = (settings as Record<string, unknown>)?.meta_whatsapp_config as
        | { phoneNumberId: string; accessToken: string }
        | null;

      const wahaConfig = (settings as Record<string, unknown>)?.waha_config as
        | { baseUrl: string; apiKey: string; sessionName: string }
        | null;

      // Prioridade: Meta Cloud API > WAHA
      if (metaConfig?.phoneNumberId && metaConfig?.accessToken) {
        const { sendMetaMessage } = await import('./meta-whatsapp');
        const result = await sendMetaMessage(metaConfig, phoneDigits, params.body);

        if (!result.success) {
          throw new Error(result.error ?? 'Meta send failed');
        }

        return {
          ok: true,
          externalMessageId: result.messageId ?? `meta-${Date.now()}`,
          channel: 'whatsapp',
        };
      }

      if (wahaConfig?.baseUrl) {
        const { sendWahaMessage } = await import('./waha');
        const result = await sendWahaMessage({ to: phone, body: params.body, wahaConfig });

        return {
          ok: true,
          externalMessageId: result.id,
          channel: 'whatsapp',
        };
      }

      throw new Error('WhatsApp not configured for this organization (configure Meta Cloud API or WAHA)');
    }

    case 'instagram': {
      const metaConfig = (settings as Record<string, unknown>)?.meta_config as
        | { pageAccessToken: string }
        | null;

      if (!metaConfig?.pageAccessToken) {
        throw new Error('Meta not configured for this organization');
      }

      const recipientId = conv.ig_conversation_id as string | null;
      if (!recipientId) {
        throw new Error('Conversation has no ig_conversation_id');
      }

      // Fase 3: importar adapter Instagram
      const { sendInstagramMessage } = await import('./meta-instagram');
      const result = await sendInstagramMessage({
        recipientId,
        body: params.body,
        pageAccessToken: metaConfig.pageAccessToken,
      });

      return {
        ok: true,
        externalMessageId: result.messageId,
        channel: 'instagram',
      };
    }

    case 'facebook': {
      const metaConfig = (settings as Record<string, unknown>)?.meta_config as
        | { pageAccessToken: string }
        | null;

      if (!metaConfig?.pageAccessToken) {
        throw new Error('Meta not configured for this organization');
      }

      const recipientId = conv.fb_conversation_id as string | null;
      if (!recipientId) {
        throw new Error('Conversation has no fb_conversation_id');
      }

      // Fase 3: importar adapter Facebook
      const { sendFacebookMessage } = await import('./meta-facebook');
      const result = await sendFacebookMessage({
        recipientId,
        body: params.body,
        pageAccessToken: metaConfig.pageAccessToken,
      });

      return {
        ok: true,
        externalMessageId: result.messageId,
        channel: 'facebook',
      };
    }

    case 'email': {
      throw new Error('Email sending via message router not yet supported');
    }

    default: {
      const _exhaustive: never = channel;
      throw new Error(`Unknown channel: ${String(_exhaustive)}`);
    }
  }
}
