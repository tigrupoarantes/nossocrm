/**
 * Meta Instagram DM Adapter
 *
 * Envio e recebimento de mensagens via Instagram Messaging API (Meta Graph API).
 * Requer aprovação do Meta App Review e permissão `instagram_manage_messages`.
 *
 * Implementação completa: Fase 3 do roadmap omnichannel.
 * Stub atual permite compilação do message-router sem erros de TypeScript.
 */

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

export interface SendInstagramParams {
  recipientId: string;
  body: string;
  pageAccessToken: string;
  mediaUrl?: string;
}

export interface InstagramSendResult {
  messageId: string;
  recipientId: string;
}

/**
 * Envia uma mensagem DM para um usuário do Instagram.
 * @param params - Destinatário, texto e token de acesso da página
 */
export async function sendInstagramMessage(
  params: SendInstagramParams,
): Promise<InstagramSendResult> {
  const response = await fetch(`${GRAPH_API_BASE}/me/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.pageAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: params.recipientId },
      message: { text: params.body },
      messaging_type: 'RESPONSE',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `Instagram API error: ${response.status}`);
  }

  const data = await response.json() as { message_id?: string; recipient_id?: string };

  return {
    messageId: data.message_id ?? `ig-${Date.now()}`,
    recipientId: data.recipient_id ?? params.recipientId,
  };
}
