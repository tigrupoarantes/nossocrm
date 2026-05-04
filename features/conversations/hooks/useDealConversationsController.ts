'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useDealConversations,
  useSendMessage,
  useInitiateConversation,
  useMarkConversationRead,
  conversationKeys,
} from '@/lib/query/hooks/useConversationsQuery';
import { queryKeys } from '@/lib/query/queryKeys';
import type { ConversationChannel, Message } from '@/types';
import type { MessageSendPayload } from '../components/MessageInput';

/**
 * Controller da aba "Conversas" no card do deal.
 *
 * Gerencia:
 * - Lista de conversas do deal (todos os canais)
 * - Seleção de conversa ativa
 * - Envio de mensagem via router omnichannel
 * - Canal padrão (último canal usado pelo lead)
 */
export function useDealConversationsController(dealId: string | null) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const { data: conversations = [], isLoading } = useDealConversations(dealId);
  const sendMessage = useSendMessage();
  const initiateConversation = useInitiateConversation();
  const markRead = useMarkConversationRead();
  const queryClient = useQueryClient();

  // Marca como lida toda conversa visível com unread_count > 0.
  // Quando "Todas" está selecionado, marca todas; quando uma específica
  // está selecionada, marca só aquela. PATCH é idempotente; o setQueryData
  // otimista zera o cache antes da resposta para evitar loop no useEffect.
  useEffect(() => {
    if (!dealId || conversations.length === 0) return;

    const target = selectedConversationId
      ? conversations.filter(c => c.id === selectedConversationId)
      : conversations;

    const toMark = target.filter(c => c.unread_count > 0);
    if (toMark.length === 0) return;

    let totalCleared = 0;
    for (const conv of toMark) {
      totalCleared += conv.unread_count;
      markRead.mutate(conv.id);
    }

    queryClient.setQueryData(
      conversationKeys.forDeal(dealId),
      (prev: typeof conversations | undefined) =>
        prev?.map(c =>
          toMark.some(m => m.id === c.id) ? { ...c, unread_count: 0 } : c,
        ),
    );
    if (totalCleared > 0) {
      queryClient.setQueriesData<unknown>(
        { queryKey: queryKeys.deals.all, exact: false },
        (prev: unknown) => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((d: Record<string, unknown>) =>
            d?.id === dealId
              ? {
                  ...d,
                  unreadInboundCount: Math.max(
                    0,
                    ((d.unreadInboundCount as number | undefined) ?? 0) - totalCleared,
                  ),
                }
              : d,
          );
        },
      );
    }
  }, [dealId, conversations, selectedConversationId, markRead, queryClient]);

  // Todas as mensagens de todas as conversas, ordenadas por sent_at
  const allMessages = useMemo((): Message[] => {
    const msgs: Message[] = [];
    for (const conv of conversations) {
      for (const msg of conv.messages ?? []) {
        msgs.push(msg);
      }
    }
    return msgs.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
  }, [conversations]);

  // Mensagens da conversa selecionada (ou todas se nenhuma selecionada)
  const visibleMessages = useMemo((): Message[] => {
    if (!selectedConversationId) return allMessages;
    const conv = conversations.find(c => c.id === selectedConversationId);
    return (conv?.messages ?? []).sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
    );
  }, [selectedConversationId, conversations, allMessages]);

  // Canais disponíveis (únicos, com pelo menos uma conversa)
  const availableChannels = useMemo((): ConversationChannel[] => {
    const channels = new Set<ConversationChannel>();
    for (const conv of conversations) {
      channels.add(conv.channel as ConversationChannel);
    }
    return Array.from(channels);
  }, [conversations]);

  // Canal padrão = canal da última mensagem recebida do lead
  const defaultChannel = useMemo((): ConversationChannel => {
    const lastInbound = [...allMessages].reverse().find(m => m.direction === 'inbound');
    return (lastInbound?.channel ?? availableChannels[0] ?? 'whatsapp') as ConversationChannel;
  }, [allMessages, availableChannels]);

  // Conversa ativa para envio
  const targetConversation = useMemo(() => {
    if (selectedConversationId) {
      return conversations.find(c => c.id === selectedConversationId) ?? conversations[0] ?? null;
    }
    return conversations[0] ?? null;
  }, [selectedConversationId, conversations]);

  const handleSend = async (payload: MessageSendPayload) => {
    if (!dealId) return;
    const { body, channel, mediaUrl, mediaType, filename } = payload;

    if (!targetConversation) {
      // Nenhuma conversa existente — iniciar nova (proactive outbound).
      // Mídia em initiate ainda não é suportada; cai no texto puro.
      await initiateConversation.mutateAsync({ dealId, channel, body });
      return;
    }

    const conv =
      conversations.find(c => c.channel === channel) ??
      conversations.find(c => c.id === targetConversation.id) ??
      targetConversation;

    await sendMessage.mutateAsync({
      conversationId: conv.id,
      body,
      channel,
      mediaUrl,
      mediaType,
      filename,
    });
  };

  return {
    conversations,
    allMessages,
    visibleMessages,
    availableChannels,
    defaultChannel,
    selectedConversationId,
    setSelectedConversationId,
    isLoading,
    isSending: sendMessage.isPending || initiateConversation.isPending,
    handleSend,
    hasConversations: conversations.length > 0,
  };
}
