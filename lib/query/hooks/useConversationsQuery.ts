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
 * Mutation para enviar mensagem via router omnichannel (/api/messages/send).
 * Invalida mensagens e lista de conversas ao concluir.
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
          replyToId: params.replyToId,
        }),
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
      // Invalida também conversas do deal se houver deal vinculado
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all });
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
