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
  useSendWahaMessage,
  useMarkConversationRead,
} from '@/lib/query/hooks/useConversationsQuery';

interface CommunicationSettings {
  configured: { waha: boolean };
}

export function useConversationsController() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  // Dados
  const { data: conversations = [], isLoading: conversationsLoading } = useConversations();
  const { data: messages = [], isLoading: messagesLoading } = useMessages(selectedConversationId);

  // Mutations
  const sendMessage = useSendWahaMessage();
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
   * Alternativa quando o body vem direto do componente (ex: MessageInput
   * compartilhado). Não depende do inputValue local.
   */
  const handleSendBody = useCallback(async (body: string) => {
    const conversationId = selectedConversationId;
    if (!conversationId || !body.trim()) return;
    await sendMessage.mutateAsync({
      conversationId,
      body: body.trim(),
    });
  }, [selectedConversationId, sendMessage]);

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
