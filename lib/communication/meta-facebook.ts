/**
 * Meta Facebook Messenger Adapter
 *
 * Envio e recebimento de mensagens via Messenger Platform (Meta Graph API).
 * Requer aprovação do Meta App Review e permissão `pages_messaging`.
 *
 * Implementação completa: Fase 3 do roadmap omnichannel.
 * Stub atual permite compilação do message-router sem erros de TypeScript.
 */

const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

export interface SendFacebookParams {
  recipientId: string;
  body: string;
  pageAccessToken: string;
  mediaUrl?: string;
}

export interface FacebookSendResult {
  messageId: string;
  recipientId: string;
}

/**
 * Envia uma mensagem via Facebook Messenger para um usuário.
 * @param params - Destinatário (PSID), texto e token de acesso da página
 */
export async function sendFacebookMessage(
  params: SendFacebookParams,
): Promise<FacebookSendResult> {
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
    throw new Error(err.error?.message ?? `Facebook API error: ${response.status}`);
  }

  const data = await response.json() as { message_id?: string; recipient_id?: string };

  return {
    messageId: data.message_id ?? `fb-${Date.now()}`,
    recipientId: data.recipient_id ?? params.recipientId,
  };
}
