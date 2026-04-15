'use client';

import React, { useEffect, useRef } from 'react';
import { MessageSquare, Settings } from 'lucide-react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useConversationsController } from '../hooks/useConversationsController';
import { MessageBubble } from '@/features/conversations/components/MessageBubble';
import { MessageInput } from '@/features/conversations/components/MessageInput';
import { useRealtimeSync } from '@/lib/realtime/useRealtimeSync';
import { useAuth } from '@/context/AuthContext';
import { useUploadConversationAttachment } from '@/features/conversations/hooks/useConversationAttachment';
import type { ConversationWithContact } from '@/lib/query/hooks/useConversationsQuery';
import type { ConversationChannel } from '@/types';

// =============================================================================
// Sub-componentes
// =============================================================================

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

interface ConversationItemProps {
  conversation: ConversationWithContact;
  isSelected: boolean;
  onClick: () => void;
}

function ConversationItem({ conversation, isSelected, onClick }: ConversationItemProps) {
  // Supabase retorna snake_case: wa_chat_id, unread_count, last_message_at
  const contactName = conversation.contacts?.name ?? (conversation.wa_chat_id?.replace('@c.us', '') ?? conversation.channel);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-white/5 transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${
        isSelected ? 'bg-blue-50 dark:bg-blue-500/10 border-l-2 border-l-blue-500' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900 dark:text-white text-sm truncate">
              {contactName}
            </span>
            {conversation.unread_count > 0 && (
              <span className="shrink-0 bg-green-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
              </span>
            )}
          </div>
          {conversation.deals?.title && (
            <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
              {conversation.deals.title}
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
          {formatTime(conversation.last_message_at)}
        </span>
      </div>
    </button>
  );
}

// =============================================================================
// Empty states
// =============================================================================

function WahaNotConfigured() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
      <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center">
        <MessageSquare size={28} className="text-slate-400" />
      </div>
      <div>
        <p className="font-medium text-slate-700 dark:text-slate-200 mb-1">
          WhatsApp não configurado
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configure o WAHA nas Configurações para usar o inbox de WhatsApp.
        </p>
      </div>
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        <Settings size={16} />
        Ir para Configurações
      </Link>
    </div>
  );
}

function NoConversationSelected() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
      <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center">
        <MessageSquare size={28} className="text-slate-300 dark:text-slate-600" />
      </div>
      <p className="text-slate-500 dark:text-slate-400 text-sm">
        Selecione uma conversa para ver as mensagens.
      </p>
    </div>
  );
}

// =============================================================================
// Componente principal
// =============================================================================

export function InboxConversationsView() {
  const {
    selectedConversationId,
    selectedConversation,
    conversations,
    messages,
    conversationsLoading,
    messagesLoading,
    isWahaConfigured,
    isSending,
    handleSelectConversation,
    handleSendBody,
  } = useConversationsController();

  // Auto-scroll para última mensagem
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime: o mapping padrão já cobre ['messages', conversationId] via
  // setQueryData. Para a lista de conversas do controller, invalidamos
  // explicitamente via callback.
  const queryClient = useQueryClient();
  useRealtimeSync(['messages', 'conversations'], {
    onchange: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'], exact: false });
    },
  });

  // Upload de anexos — habilita paperclip e mic no MessageInput
  const { organizationId } = useAuth();
  const uploadMutation = useUploadConversationAttachment();
  const uploadAttachment = organizationId
    ? async (file: File) => {
        const r = await uploadMutation.mutateAsync({ organizationId, file });
        return { url: r.url, mediaType: r.mediaType, filename: r.filename };
      }
    : undefined;

  if (!isWahaConfigured) {
    return (
      <div className="h-[600px] rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
        <WahaNotConfigured />
      </div>
    );
  }

  const contactName = selectedConversation?.contacts?.name
    ?? selectedConversation?.wa_chat_id?.replace('@c.us', '')
    ?? selectedConversation?.channel
    ?? '';

  return (
    <div className="flex h-[600px] rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-dark-card">
      {/* Painel esquerdo: lista de conversas */}
      <div className="w-72 shrink-0 border-r border-slate-200 dark:border-white/10 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10">
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">WhatsApp</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {conversations.length} conversa{conversations.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversationsLoading && (
            <div className="p-4 text-sm text-slate-400 text-center">Carregando...</div>
          )}
          {!conversationsLoading && conversations.length === 0 && (
            <div className="p-4 text-sm text-slate-400 text-center">
              Nenhuma conversa ainda.
            </div>
          )}
          {conversations.map(conv => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={conv.id === selectedConversationId}
              onClick={() => handleSelectConversation(conv.id)}
            />
          ))}
        </div>
      </div>

      {/* Painel direito: thread de mensagens */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedConversationId ? (
          <NoConversationSelected />
        ) : (
          <>
            {/* Header da conversa */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <MessageSquare size={16} className="text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-slate-900 dark:text-white text-sm truncate">
                  {contactName}
                </p>
                {selectedConversation?.deals?.title && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                    {selectedConversation.deals.title}
                  </p>
                )}
              </div>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 dark:bg-black/10">
              {messagesLoading && (
                <div className="text-sm text-slate-400 text-center py-8">Carregando mensagens...</div>
              )}
              {!messagesLoading && messages.length === 0 && (
                <div className="text-sm text-slate-400 text-center py-8">
                  Nenhuma mensagem ainda. Envie a primeira!
                </div>
              )}
              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input compartilhado: Shift+Enter = nova linha, Enter = envia.
                Paperclip + Mic habilitados via uploadAttachment. */}
            <MessageInput
              availableChannels={['whatsapp' as ConversationChannel]}
              defaultChannel="whatsapp"
              isSending={isSending}
              onSend={handleSendBody}
              uploadAttachment={uploadAttachment}
            />
          </>
        )}
      </div>
    </div>
  );
}
