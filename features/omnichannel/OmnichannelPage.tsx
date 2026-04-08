'use client';

import React, { useMemo, useState } from 'react';
import { MessageSquare, Search, Phone, Bot, UserCheck, X, RotateCcw, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkConversationRead,
  useAssignConversation,
  useCloseConversation,
  useReopenConversation,
  type ConversationStatus,
  type ConversationWithContact,
} from '@/lib/query/hooks/useConversationsQuery';
import { ConversationThread } from '@/features/conversations/components/ConversationThread';
import { ChannelIcon } from '@/features/conversations/components/ChannelBadge';

// =============================================================================
// Helpers
// =============================================================================

const STATUS_TABS: Array<{ key: ConversationStatus | 'all'; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'em_espera', label: 'Em espera' },
  { key: 'em_atendimento', label: 'Em atendimento' },
  { key: 'encerrado', label: 'Encerrados' },
];

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  return isToday
    ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function contactDisplay(c: ConversationWithContact): { name: string; phone: string } {
  const name = c.contacts?.name ?? c.wa_chat_id?.replace('@c.us', '') ?? c.channel;
  const phone = c.contacts?.phone ?? c.wa_chat_id?.replace('@c.us', '') ?? '';
  return { name, phone };
}

function assignedDisplayName(profile: ConversationWithContact['assigned_user']): string {
  if (!profile) return 'Atendente';
  if (profile.nickname) return profile.nickname;
  const full = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  return full || 'Atendente';
}

function assignedInitials(profile: ConversationWithContact['assigned_user']): string {
  if (!profile) return 'A';
  if (profile.first_name && profile.last_name) {
    return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
  }
  const name = assignedDisplayName(profile);
  return name.substring(0, 2).toUpperCase();
}

function StatusPill({ status }: { status: ConversationStatus }) {
  const styles: Record<ConversationStatus, string> = {
    em_espera: 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30',
    em_atendimento: 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/30',
    encerrado: 'bg-slate-500/20 text-slate-500 dark:text-slate-400 border border-slate-500/30',
  };
  const labels: Record<ConversationStatus, string> = {
    em_espera: 'Em espera',
    em_atendimento: 'Em atendimento',
    encerrado: 'Encerrado',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function AgentBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/30">
      <Bot size={10} />
      Agente IA
    </span>
  );
}

// =============================================================================
// Coluna B — Fila
// =============================================================================

interface QueueProps {
  conversations: ConversationWithContact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  search: string;
  onSearch: (v: string) => void;
  activeTab: ConversationStatus | 'all';
  onTabChange: (tab: ConversationStatus | 'all') => void;
  counts: Record<ConversationStatus | 'all', number>;
}

function ConversationQueue({
  conversations,
  selectedId,
  onSelect,
  loading,
  search,
  onSearch,
  activeTab,
  onTabChange,
  counts,
}: QueueProps) {
  return (
    <div className="w-[360px] shrink-0 border-r border-slate-200 dark:border-white/10 flex flex-col bg-white dark:bg-dark-card">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-primary-500" />
          <h2 className="font-semibold text-slate-900 dark:text-white text-base">Conversas</h2>
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
          {conversations.length}
        </span>
      </div>

      {/* Search */}
      <div className="px-3 py-3 border-b border-slate-100 dark:border-white/5">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100 dark:bg-white/5 border border-transparent rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-3 pt-2 pb-1 flex gap-1 border-b border-slate-100 dark:border-white/5 overflow-x-auto scrollbar-hide">
        {STATUS_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = counts[tab.key] ?? 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                isActive
                  ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              {tab.label}
              {count > 0 && <span className="ml-1.5 opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-6 text-sm text-slate-400 text-center">Carregando...</div>
        )}
        {!loading && conversations.length === 0 && (
          <div className="p-6 text-sm text-slate-400 text-center">Nenhuma conversa.</div>
        )}
        {conversations.map((conv) => {
          const { name } = contactDisplay(conv);
          const isSelected = conv.id === selectedId;
          return (
            <button
              key={conv.id}
              type="button"
              onClick={() => onSelect(conv.id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-white/5 transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${
                isSelected ? 'bg-primary-500/5 border-l-2 border-l-primary-500' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900 dark:text-white text-sm truncate">
                      {name}
                    </span>
                    <time className="shrink-0 text-[10px] text-slate-400">
                      {formatTime(conv.last_message_at)}
                    </time>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {conv.status === 'em_atendimento' && conv.assigned_user
                      ? `Atendente: ${assignedDisplayName(conv.assigned_user)}`
                      : conv.deals?.title ?? 'WhatsApp'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <StatusPill status={conv.status} />
                    {conv.ai_agent_owned && <AgentBadge />}
                    <span className="text-[10px] text-slate-400 inline-flex items-center gap-0.5">
                      <ChannelIcon channel={conv.channel} />
                    </span>
                    {conv.unread_count > 0 && (
                      <span className="ml-auto bg-primary-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center">
                        {conv.unread_count > 9 ? '9+' : conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Coluna C — Thread
// =============================================================================

interface ThreadPaneProps {
  conversation: ConversationWithContact | null;
  currentUserId: string | undefined;
  onAssign: () => void;
  onClose: () => void;
  onReopen: () => void;
  isMutating: boolean;
}

function ConversationHeader({ conversation, currentUserId, onAssign, onClose, onReopen, isMutating }: ThreadPaneProps) {
  if (!conversation) return null;
  const { name, phone } = contactDisplay(conversation);
  const isMine = conversation.assigned_user_id === currentUserId;
  const channelLabel = conversation.channel.charAt(0).toUpperCase() + conversation.channel.slice(1);

  return (
    <div className="px-6 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-4 bg-white dark:bg-dark-card">
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 dark:text-white truncate">{name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Phone size={11} />
            {phone}
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <ChannelIcon channel={conversation.channel} />
            {channelLabel}
          </p>
          {conversation.assigned_user_id && (
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-300 text-[9px] font-bold">
                {assignedInitials(conversation.assigned_user)}
              </span>
              <span>
                Atendendo:{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {assignedDisplayName(conversation.assigned_user)}
                </span>
                {isMine && <span className="text-slate-400"> (você)</span>}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {conversation.ai_agent_owned && <AgentBadge />}
        <StatusPill status={conversation.status} />

        {conversation.status !== 'encerrado' && !isMine && (
          <button
            type="button"
            onClick={onAssign}
            disabled={isMutating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/30 rounded-lg hover:bg-primary-500/20 transition-colors disabled:opacity-50"
          >
            <UserCheck size={13} />
            Assumir atendimento
          </button>
        )}

        {conversation.status !== 'encerrado' && isMine && (
          <button
            type="button"
            onClick={onClose}
            disabled={isMutating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-200 dark:hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            <X size={13} />
            Encerrar
          </button>
        )}

        {conversation.status === 'encerrado' && (
          <button
            type="button"
            onClick={onReopen}
            disabled={isMutating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={13} />
            Reabrir
          </button>
        )}
      </div>
    </div>
  );
}

interface ComposerProps {
  conversation: ConversationWithContact;
  currentUserId: string | undefined;
  inputValue: string;
  setInputValue: (v: string) => void;
  onSend: () => void;
  isSending: boolean;
}

function ConversationComposer({
  conversation,
  currentUserId,
  inputValue,
  setInputValue,
  onSend,
  isSending,
}: ComposerProps) {
  const isMine = conversation.assigned_user_id === currentUserId;
  const isClosed = conversation.status === 'encerrado';
  const blockedByOther = !!conversation.assigned_user_id && !isMine;

  if (isClosed) {
    return (
      <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Lock size={14} />
          Conversa encerrada. Reabra para responder.
        </div>
      </div>
    );
  }

  if (blockedByOther) {
    return (
      <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Lock size={14} />
          Você não é o responsável por esta conversa.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-dark-card flex gap-2">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="Digite uma mensagem..."
        disabled={isSending}
        className="flex-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onSend}
        disabled={isSending || !inputValue.trim()}
        className="px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Enviar
      </button>
    </div>
  );
}

function EmptyConversationState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center">
        <MessageSquare size={28} className="text-slate-300 dark:text-slate-600" />
      </div>
      <p className="text-slate-500 dark:text-slate-400 text-sm">
        Selecione uma conversa para começar.
      </p>
    </div>
  );
}

// =============================================================================
// Página principal
// =============================================================================

export function OmnichannelPage() {
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [activeTab, setActiveTab] = useState<ConversationStatus | 'all'>('em_espera');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [inputValue, setInputValue] = useState('');

  // Lista completa (sem filtro de status no servidor) para calcular counts por tab
  const { data: allConversations = [], isLoading } = useConversations();
  const { data: messages = [], isLoading: messagesLoading } = useMessages(selectedId);

  const sendMessage = useSendMessage();
  const markRead = useMarkConversationRead();
  const assign = useAssignConversation();
  const closeConv = useCloseConversation();
  const reopen = useReopenConversation();

  // Counts por tab
  const counts = useMemo(() => {
    const c: Record<ConversationStatus | 'all', number> = {
      all: allConversations.length,
      em_espera: 0,
      em_atendimento: 0,
      encerrado: 0,
    };
    for (const conv of allConversations) {
      c[conv.status] = (c[conv.status] ?? 0) + 1;
    }
    return c;
  }, [allConversations]);

  // Filtragem cliente (status + busca)
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allConversations.filter((conv) => {
      if (activeTab !== 'all' && conv.status !== activeTab) return false;
      if (!term) return true;
      const { name, phone } = contactDisplay(conv);
      return name.toLowerCase().includes(term) || phone.toLowerCase().includes(term);
    });
  }, [allConversations, activeTab, search]);

  const selectedConversation = useMemo(
    () => allConversations.find((c) => c.id === selectedId) ?? null,
    [allConversations, selectedId],
  );

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setInputValue('');
    markRead.mutate(id);
  };

  const handleSend = async () => {
    if (!selectedId || !inputValue.trim()) return;
    const body = inputValue.trim();
    setInputValue('');
    try {
      await sendMessage.mutateAsync({ conversationId: selectedId, body });
    } catch (e) {
      console.error('[Omnichannel] send failed', e);
      setInputValue(body);
    }
  };

  const isMutating = assign.isPending || closeConv.isPending || reopen.isPending;

  return (
    <div className="flex h-[calc(100vh-8rem)] -m-6 rounded-none border-t border-slate-200 dark:border-white/10 overflow-hidden">
      <ConversationQueue
        conversations={filtered}
        selectedId={selectedId}
        onSelect={handleSelect}
        loading={isLoading}
        search={search}
        onSearch={setSearch}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        counts={counts}
      />

      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-black/10">
        {!selectedConversation ? (
          <EmptyConversationState />
        ) : (
          <>
            <ConversationHeader
              conversation={selectedConversation}
              currentUserId={currentUserId}
              onAssign={() => assign.mutate(selectedConversation.id)}
              onClose={() => closeConv.mutate(selectedConversation.id)}
              onReopen={() => reopen.mutate(selectedConversation.id)}
              isMutating={isMutating}
            />
            <ConversationThread messages={messages} loading={messagesLoading} />
            <ConversationComposer
              conversation={selectedConversation}
              currentUserId={currentUserId}
              inputValue={inputValue}
              setInputValue={setInputValue}
              onSend={handleSend}
              isSending={sendMessage.isPending}
            />
          </>
        )}
      </div>
    </div>
  );
}
