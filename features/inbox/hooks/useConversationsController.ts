/**
 * Controller para o inbox de conversas WhatsApp (WAHA).
 *
 * Gerencia conversa selecionada, envio de mensagens e
 * verificação se o WAHA está configurado para a organização.
 */

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkConversationRead,
} from '@/lib/query/hooks/useConversationsQuery';
import type { MessageSendPayload } from '@/features/conversations/components/MessageInput';

interface CommunicationSettings {
  configured: { waha: boolean };
}

export function useConversationsController() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  // Dados
  const { data: conversations = [], isLoading: conversationsLoading } = useConversations();
  const { data: messages = [], isLoading: messagesLoading } = useMessages(selectedConversationId);

  // Mutations — useSendMessage usa o router omnichannel (/api/messages/send)
  // e suporta mediaUrl/mediaType/filename, diferente do legado useSendWahaMessage.
  const sendMessage = useSendMessage();
  const markRead = useMarkConversationRead();

  // Verificar se WAHA está configurado
  const { data: commSettings } = useQuery<CommunicationSettings>({
    queryKey: ['settings', 'communication', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/settings/communication');
      if (!res.ok) return { configured: { waha: false } };
      return res.json() as Promise<CommunicationSettings>;
    },
    staleTime: 60_000,
  });

  const isWahaConfigured = commSettings?.configured?.waha ?? false;

  const handleSelectConversation = useCallback((conversationId: string) => {
    setSelectedConversationId(conversationId);
    setInputValue('');
    // Marcar como lida ao selecionar
    markRead.mutate(conversationId);
  }, [markRead]);

  const handleSendMessage = useCallback(async () => {
    if (!selectedConversationId || !inputValue.trim()) return;

    await sendMessage.mutateAsync({
      conversationId: selectedConversationId,
      body: inputValue.trim(),
    });

    setInputValue('');
  }, [selectedConversationId, inputValue, sendMessage]);

  /**
   * Envio via MessageInput compartilhado — aceita body, mídia (url + type + filename)
   * e canal. Quando há mediaUrl o body funciona como caption.
   */
  const handleSendBody = useCallback(
    async (payload: MessageSendPayload) => {
      const conversationId = selectedConversationId;
      if (!conversationId) return;
      if (!payload.body.trim() && !payload.mediaUrl) return;
      await sendMessage.mutateAsync({
        conversationId,
        body: payload.body.trim(),
        channel: payload.channel,
        mediaUrl: payload.mediaUrl,
        mediaType: payload.mediaType,
        filename: payload.filename,
      });
    },
    [selectedConversationId, sendMessage],
  );

  const selectedConversation = conversations.find(c => c.id === selectedConversationId) ?? null;

  return {
    // State
    selectedConversationId,
    selectedConversation,
    inputValue,
    setInputValue,

    // Data
    conversations,
    messages,
    conversationsLoading,
    messagesLoading,

    // Flags
    isWahaConfigured,
    isSending: sendMessage.isPending,

    // Handlers
    handleSelectConversation,
    handleSendMessage,
    handleSendBody,
  };
}
