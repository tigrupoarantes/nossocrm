/**
 * TanStack Query hooks for Conversations + Messages (Omnichannel)
 *
 * Features:
 * - Fetch conversations list ordered by last_message_at (todos os canais)
 * - Fetch messages for a specific conversation
 * - Send message via router unificado (/api/messages/send)
 * - Fetch all conversations for a deal (/api/deals/[id]/conversations)
 * - Mark conversation as read
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ConversationChannel, Message } from '@/types';

// =============================================================================
// Query keys
// =============================================================================

export const conversationKeys = {
  all: ['conversations'] as const,
  lists: () => [...conversationKeys.all, 'list'] as const,
  detail: (id: string) => [...conversationKeys.all, 'detail', id] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
  forDeal: (dealId: string) => [...conversationKeys.all, 'deal', dealId] as const,
};

// =============================================================================
// Types (snake_case — espelha resposta raw do Supabase)
// =============================================================================

export type ConversationStatus = 'em_espera' | 'em_atendimento' | 'encerrado';

export interface ConversationWithContact {
  id: string;
  organization_id: string;
  contact_id: string | null;
  deal_id: string | null;
  channel: ConversationChannel;
  wa_chat_id: string | null;
  ig_conversation_id: string | null;
  fb_conversation_id: string | null;
  channel_metadata: Record<string, unknown>;
  last_message_at: string | null;
  unread_count: number;
  status: ConversationStatus;
  assigned_user_id: string | null;
  ai_agent_owned: boolean;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
  contacts?: { name: string; phone: string } | null;
  deals?: { title: string } | null;
  assigned_user?: {
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
    avatar_url: string | null;
  } | null;
}

export interface ConversationsFilter {
  channel?: ConversationChannel;
  status?: ConversationStatus;
  assignedTo?: 'me' | 'unassigned' | string;
}

export interface ConversationWithMessages extends ConversationWithContact {
  messages: Message[];
}

export interface SendMessageParams {
  conversationId: string;
  body: string;
  channel?: ConversationChannel;
  mediaUrl?: string;
  mediaType?: 'image' | 'audio' | 'video' | 'document';
  filename?: string;
  replyToId?: string;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Fetch all conversations for the current org, ordered by last_message_at DESC.
 * Aceita um filtro (canal, status, atribuição). Para compatibilidade, ainda
 * aceita o atalho legado `useConversations('whatsapp')` apenas com o canal.
 */
export function useConversations(filter?: ConversationChannel | ConversationsFilter) {
  const normalized: ConversationsFilter =
    typeof filter === 'string' ? { channel: filter } : (filter ?? {});

  const queryKey = [
    ...conversationKeys.lists(),
    normalized.channel ?? null,
    normalized.status ?? null,
    normalized.assignedTo ?? null,
  ] as const;

  return useQuery<ConversationWithContact[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (normalized.channel) params.set('channel', normalized.channel);
      if (normalized.status) params.set('status', normalized.status);
      if (normalized.assignedTo) params.set('assignedTo', normalized.assignedTo);
      const qs = params.toString();
      const url = qs ? `/api/conversations?${qs}` : '/api/conversations';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch conversations: ${response.status}`);
      }
      const data = await response.json() as { data: ConversationWithContact[] };
      return data.data ?? [];
    },
    staleTime: 30_000,
  });
}

/**
 * Fetch messages for a specific conversation, ordered by sent_at ASC.
 */
export function useMessages(conversationId: string | null) {
  return useQuery<Message[]>({
    queryKey: conversationKeys.messages(conversationId ?? ''),
    queryFn: async () => {
      if (!conversationId) return [];
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.status}`);
      }
      const data = await response.json() as { data: Message[] };
      return data.data ?? [];
    },
    enabled: !!conversationId,
    staleTime: 10_000,
  });
}

/**
 * Fetch all conversations (com mensagens embutidas) de um deal específico.
 * Usado pela aba "Conversas" no card do deal.
 */
export function useDealConversations(dealId: string | null) {
  return useQuery<ConversationWithMessages[]>({
    queryKey: conversationKeys.forDeal(dealId ?? ''),
    queryFn: async () => {
      if (!dealId) return [];
      const response = await fetch(`/api/deals/${dealId}/conversations`);
      if (!response.ok) {
        throw new Error(`Failed to fetch deal conversations: ${response.status}`);
      }
      const data = await response.json() as { data: ConversationWithMessages[] };
      return data.data ?? [];
    },
    enabled: !!dealId,
    staleTime: 15_000,
  });
}

/**
 * Cria uma mensagem otimista (status='sending') para inserir no cache antes
 * da resposta do servidor. O React renderiza a bolha imediatamente; quando o
 * POST volta, a invalidação substitui a temp pela real.
 */
function createOptimisticMessage(params: SendMessageParams): Message {
  const now = new Date().toISOString();
  const messageType = params.mediaType
    ? params.mediaType === 'document' ? 'file' : params.mediaType
    : 'text';
  return {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    organizationId: '',
    conversationId: params.conversationId,
    waMessageId: null,
    externalMessageId: null,
    channel: params.channel ?? 'whatsapp',
    messageType,
    direction: 'outbound',
    body: params.body,
    mediaUrl: params.mediaUrl ?? null,
    status: 'sending',
    sentAt: now,
    createdAt: now,
    metadata: params.filename ? { filename: params.filename } : {},
  };
}

/**
 * Mutation para enviar mensagem via router omnichannel (/api/messages/send).
 *
 * Optimistic UI: insere uma bolha temporária com status='sending' no cache
 * de mensagens ANTES do POST. Quando o servidor confirma, invalida e a temp
 * é substituída pela real (com external_message_id e status='sent'). Em caso
 * de erro, faz rollback do snapshot e mantém a temp marcada como 'failed'.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SendMessageParams) => {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: params.conversationId,
          body: params.body,
          channel: params.channel,
          mediaUrl: params.mediaUrl,
          mediaType: params.mediaType,
          filename: params.filename,
          replyToId: params.replyToId,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Send failed: ${response.status}`);
      }

      return response.json() as Promise<{ ok: boolean; message: Message }>;
    },
    onMutate: async (variables) => {
      const messagesKey = conversationKeys.messages(variables.conversationId);
      // Cancela queries em voo para não sobrescrever a temp.
      await queryClient.cancelQueries({ queryKey: messagesKey });

      const previous = queryClient.getQueryData<Message[]>(messagesKey) ?? [];
      const tempMessage = createOptimisticMessage(variables);

      queryClient.setQueryData<Message[]>(messagesKey, [...previous, tempMessage]);

      return { previous, tempId: tempMessage.id, messagesKey };
    },
    onError: (_err, _variables, context) => {
      // Rollback: restaura snapshot mas mantém a temp marcada como 'failed'
      // para o usuário ver que falhou (em vez de sumir silenciosamente).
      if (!context) return;
      const failed: Message[] = context.previous.map((m) => m);
      const tempCopy = queryClient
        .getQueryData<Message[]>(context.messagesKey)
        ?.find((m) => m.id === context.tempId);
      if (tempCopy) {
        failed.push({ ...tempCopy, status: 'failed' });
      }
      queryClient.setQueryData<Message[]>(context.messagesKey, failed);
    },
    onSuccess: (data, variables, context) => {
      // CRÍTICO: substituir a temp INLINE em vez de invalidar+refetch.
      // Invalidar causa o bug "aparece e some" porque o realtime do messages
      // dispara em paralelo e o refetch não inclui a temp (que é client-only).
      const messagesKey = conversationKeys.messages(variables.conversationId);
      const serverMessage = data?.message;
      if (serverMessage && context?.tempId) {
        queryClient.setQueryData<Message[]>(messagesKey, (old) => {
          if (!old) return [serverMessage];
          // Remove a temp e qualquer duplicata por id real
          const withoutTemp = old.filter(
            (m) => m.id !== context.tempId && m.id !== serverMessage.id,
          );
          return [...withoutTemp, serverMessage];
        });
      }
      // Lista de conversas pode mudar (last_message_at) — pode invalidar.
      void queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
    },
  });
}

/**
 * Mutation para iniciar uma conversa nova a partir de um deal (proactive outbound).
 * Cria a conversa no banco e envia a primeira mensagem.
 */
export function useInitiateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { dealId: string; channel: ConversationChannel; body: string }) => {
      const response = await fetch(`/api/deals/${params.dealId}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: params.channel, text: params.body }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Initiate failed: ${response.status}`);
      }

      return response.json() as Promise<{ ok: boolean; conversationId: string }>;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.forDeal(variables.dealId) });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
    },
  });
}

/**
 * @deprecated Use useSendMessage() — suporta todos os canais via router omnichannel.
 * Mantido para compatibilidade com InboxConversationsView existente.
 */
export function useSendWahaMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { conversationId: string; body: string }) => {
      const response = await fetch(`/api/conversations/${params.conversationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: params.body }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Send failed: ${response.status}`);
      }

      return response.json() as Promise<{ ok: boolean; message: Message }>;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.messages(variables.conversationId) });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
    },
  });
}

// =============================================================================
// Omnichannel — atribuição, encerramento, handoff
// =============================================================================

function useConversationStatusMutation(action: 'assign' | 'close' | 'reopen' | 'handoff-to-ai') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const response = await fetch(`/api/conversations/${conversationId}/${action}`, {
        method: 'POST',
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `${action} failed: ${response.status}`);
      }
      return response.json() as Promise<{ ok: boolean }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    },
  });
}

/** Atribui a conversa ao usuário atual (status -> em_atendimento, ai_agent_owned -> false). */
export function useAssignConversation() {
  return useConversationStatusMutation('assign');
}

/** Encerra a conversa (status -> encerrado). */
export function useCloseConversation() {
  return useConversationStatusMutation('close');
}

/** Reabre uma conversa encerrada (status -> em_espera). */
export function useReopenConversation() {
  return useConversationStatusMutation('reopen');
}

/** Devolve a conversa para o Super Agente (ai_agent_owned -> true). */
export function useHandoffToAI() {
  return useConversationStatusMutation('handoff-to-ai');
}

/**
 * Mutation to mark a conversation as read (unread_count = 0).
 */
export function useMarkConversationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const response = await fetch(`/api/conversations/${conversationId}/read`, {
        method: 'PATCH',
      });
      if (!response.ok) throw new Error(`Mark read failed: ${response.status}`);
      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
    },
  });
}
