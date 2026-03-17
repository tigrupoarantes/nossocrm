/**
 * TanStack Query hooks for Conversations + Messages (WAHA WhatsApp)
 *
 * Features:
 * - Fetch conversations list ordered by last_message_at
 * - Fetch messages for a specific conversation
 * - Send message mutation (via WAHA API route)
 * - Mark conversation as read
 * - Realtime subscription for new messages
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Message } from '@/types';

// =============================================================================
// Query keys
// =============================================================================

export const conversationKeys = {
  all: ['conversations'] as const,
  lists: () => [...conversationKeys.all, 'list'] as const,
  detail: (id: string) => [...conversationKeys.all, 'detail', id] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
};

// =============================================================================
// Types
// Nota: o Supabase retorna colunas em snake_case (ex.: wa_chat_id, unread_count)
// =============================================================================

export interface ConversationWithContact {
  id: string;
  organization_id: string;
  contact_id: string | null;
  deal_id: string | null;
  channel: 'whatsapp';
  wa_chat_id: string;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
  contacts?: { name: string; phone: string } | null;
  deals?: { title: string } | null;
}

export interface SendMessageParams {
  conversationId: string;
  body: string;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Fetch all conversations for the current org, ordered by last_message_at DESC.
 */
export function useConversations() {
  return useQuery<ConversationWithContact[]>({
    queryKey: conversationKeys.lists(),
    queryFn: async () => {
      const response = await fetch('/api/conversations');
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
 * Mutation to send a WhatsApp message via WAHA.
 * On success, invalidates messages and conversations list.
 */
export function useSendWahaMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SendMessageParams) => {
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
      // Invalida mensagens da conversa e lista de conversas
      void queryClient.invalidateQueries({ queryKey: conversationKeys.messages(variables.conversationId) });
      void queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
    },
  });
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
