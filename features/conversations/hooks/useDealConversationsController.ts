'use client';

import { useState, useMemo } from 'react';
import { useDealConversations, useSendMessage } from '@/lib/query/hooks/useConversationsQuery';
import type { ConversationChannel, Message } from '@/types';

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

  const handleSend = async (body: string, channel: ConversationChannel) => {
    if (!targetConversation) return;

    // Encontrar conversa do canal selecionado (ou usar a primeira disponível)
    const conv =
      conversations.find(c => c.channel === channel) ??
      conversations.find(c => c.id === targetConversation.id) ??
      targetConversation;

    await sendMessage.mutateAsync({
      conversationId: conv.id,
      body,
      channel,
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
    isSending: sendMessage.isPending,
    handleSend,
    hasConversations: conversations.length > 0,
  };
}
