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

export type OutboundMediaType = 'image' | 'audio' | 'video' | 'document';

export interface RouteMessageParams {
  /** ID da conversa no banco (para buscar canal, chat ID e config) */
  conversationId: string;
  /** Texto da mensagem (ou caption quando houver mediaUrl) */
  body: string;
  /** Canal a usar — se omitido, usa o canal da conversa */
  channel?: ConversationChannel;
  /** URL pública da mídia (bucket `conversation-attachments`) */
  mediaUrl?: string;
  /** Categoria da mídia — dirige o adapter a escolher o endpoint certo */
  mediaType?: OutboundMediaType;
  /** Nome original do arquivo (usado em document) */
  filename?: string;
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

      const hasMedia = !!(params.mediaUrl && params.mediaType);

      // Prioridade: Meta Cloud API > WAHA
      if (metaConfig?.phoneNumberId && metaConfig?.accessToken) {
        if (hasMedia) {
          const meta = await import('./meta-whatsapp');
          let result: { success: boolean; messageId?: string; error?: string };
          switch (params.mediaType) {
            case 'image':
              result = await meta.sendMetaImage(metaConfig, phoneDigits, params.mediaUrl!, params.body || undefined);
              break;
            case 'document':
              result = await meta.sendMetaDocument(
                metaConfig,
                phoneDigits,
                params.mediaUrl!,
                params.filename ?? 'documento',
                params.body || undefined,
              );
              break;
            case 'audio':
              result = await meta.sendMetaAudio(metaConfig, phoneDigits, params.mediaUrl!);
              break;
            case 'video':
              result = await meta.sendMetaVideo(metaConfig, phoneDigits, params.mediaUrl!, params.body || undefined);
              break;
            default:
              throw new Error(`Unsupported mediaType: ${params.mediaType}`);
          }
          if (!result.success) {
            throw new Error(result.error ?? 'Meta media send failed');
          }
          return {
            ok: true,
            externalMessageId: result.messageId ?? `meta-${Date.now()}`,
            channel: 'whatsapp',
          };
        }

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
        if (hasMedia) {
          const waha = await import('./waha');
          let result: { id: string; timestamp: number };
          switch (params.mediaType) {
            case 'image':
              result = await waha.sendWahaImage({
                to: phone,
                mediaUrl: params.mediaUrl!,
                caption: params.body || undefined,
                wahaConfig,
              });
              break;
            case 'document':
              result = await waha.sendWahaFile({
                to: phone,
                mediaUrl: params.mediaUrl!,
                filename: params.filename ?? 'documento',
                caption: params.body || undefined,
                wahaConfig,
              });
              break;
            case 'audio':
              // sendWahaVoice usa `convert: true` (ffmpeg server-side no WAHA Plus),
              // então qualquer formato vira OGG/Opus antes de virar PTT. Sem isso,
              // áudios WebM/M4A enviados como voice fazem o WhatsApp do destinatário
              // crashar tentando reproduzir.
              result = await waha.sendWahaVoice({
                to: phone,
                mediaUrl: params.mediaUrl!,
                wahaConfig,
              });
              break;
            case 'video':
              result = await waha.sendWahaVideo({
                to: phone,
                mediaUrl: params.mediaUrl!,
                caption: params.body || undefined,
                wahaConfig,
              });
              break;
            default:
              throw new Error(`Unsupported mediaType: ${params.mediaType}`);
          }
          return {
            ok: true,
            externalMessageId: result.id,
            channel: 'whatsapp',
          };
        }

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
