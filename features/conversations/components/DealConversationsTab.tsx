'use client';

import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useDealConversationsController } from '../hooks/useDealConversationsController';
import { ConversationThread } from './ConversationThread';
import { MessageInput } from './MessageInput';
import { ChannelBadge } from './ChannelBadge';
import type { ConversationChannel } from '@/types';

interface DealConversationsTabProps {
  dealId: string;
  contactId?: string | null;
}

// =============================================================================
// Empty state
// =============================================================================

function NoConversations() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 py-8">
      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center">
        <MessageSquare size={24} className="text-slate-300 dark:text-slate-600" />
      </div>
      <div>
        <p className="font-medium text-slate-600 dark:text-slate-300 text-sm mb-1">
          Nenhuma conversa ainda
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          As conversas aparecerão aqui quando o contato enviar uma mensagem.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Componente principal
// =============================================================================

export function DealConversationsTab({ dealId }: DealConversationsTabProps) {
  const {
    conversations,
    visibleMessages,
    availableChannels,
    defaultChannel,
    selectedConversationId,
    setSelectedConversationId,
    isLoading,
    isSending,
    handleSend,
    hasConversations,
  } = useDealConversationsController(dealId);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filtros por conversa/canal (quando há múltiplas conversas) */}
      {conversations.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 dark:border-white/10 overflow-x-auto">
          <button
            onClick={() => setSelectedConversationId(null)}
            className={`shrink-0 text-xs px-2.5 py-1 rounded-full transition-colors ${
              selectedConversationId === null
                ? 'bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white font-medium'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            Todas
          </button>
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => setSelectedConversationId(conv.id)}
              className={`shrink-0 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors ${
                selectedConversationId === conv.id
                  ? 'bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white font-medium'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <ChannelBadge channel={conv.channel as ConversationChannel} size="sm" />
              {conv.unread_count > 0 && (
                <span className="bg-green-500 text-white text-[9px] font-bold rounded-full px-1 min-w-[14px] text-center">
                  {conv.unread_count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Área de mensagens */}
      <div className="flex flex-col flex-1 min-h-0">
        {!hasConversations && !isLoading ? (
          <NoConversations />
        ) : (
          <>
            <ConversationThread messages={visibleMessages} loading={isLoading} />
            <MessageInput
              onSend={handleSend}
              availableChannels={availableChannels.length > 0 ? availableChannels : ['whatsapp']}
              defaultChannel={defaultChannel}
              isSending={isSending}
              disabled={!hasConversations}
            />
          </>
        )}
      </div>
    </div>
  );
}
