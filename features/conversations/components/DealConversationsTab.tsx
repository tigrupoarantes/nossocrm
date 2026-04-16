'use client';

import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useDealConversationsController } from '../hooks/useDealConversationsController';
import { ConversationThread } from './ConversationThread';
import { MessageInput } from './MessageInput';
import { ChannelBadge } from './ChannelBadge';
import { useRealtimeSync } from '@/lib/realtime/useRealtimeSync';
import { useAuth } from '@/context/AuthContext';
import { useUploadConversationAttachment } from '../hooks/useConversationAttachment';
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
    <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center px-6 py-8">
      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center">
        <MessageSquare size={24} className="text-slate-300 dark:text-slate-600" />
      </div>
      <div>
        <p className="font-medium text-slate-600 dark:text-slate-300 text-sm mb-1">
          Nenhuma conversa ainda
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Envie a primeira mensagem para iniciar o contato.
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

  // Realtime: quando chega mensagem nova para qualquer conversa da org,
  // invalida a query do deal (que inclui mensagens embutidas por conversa).
  // Sem isso, inbound só aparece após polling/F5.
  const queryClient = useQueryClient();
  useRealtimeSync(['messages', 'conversations'], {
    onchange: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', 'deal', dealId], exact: false });
    },
  });

  // Upload de anexos — sempre definido para garantir que clip/mic apareçam mesmo
  // se organizationId ainda estiver carregando. Validação ocorre no clique.
  const { organizationId } = useAuth();
  const uploadMutation = useUploadConversationAttachment();
  const uploadAttachment = async (file: File) => {
    if (!organizationId) {
      throw new Error('Sessão ainda carregando. Aguarde um instante e tente novamente.');
    }
    const r = await uploadMutation.mutateAsync({ organizationId, file });
    return { url: r.url, mediaType: r.mediaType, filename: r.filename };
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
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
                <span className="bg-green-500 text-white text-[9px] font-bold rounded-full px-1 min-w-3.5 text-center">
                  {conv.unread_count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Área de mensagens — flex-1 garante que o input fique sempre visível */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {!hasConversations && !isLoading ? (
          <NoConversations />
        ) : (
          <ConversationThread messages={visibleMessages} loading={isLoading} />
        )}
        <div className="shrink-0">
          <MessageInput
            onSend={handleSend}
            availableChannels={availableChannels.length > 0 ? availableChannels : ['whatsapp']}
            defaultChannel={defaultChannel}
            isSending={isSending}
            uploadAttachment={uploadAttachment}
          />
        </div>
      </div>
    </div>
  );
}
