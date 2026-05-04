'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { Message } from '@/types';
import { MessageBubble } from './MessageBubble';

interface ConversationThreadProps {
  messages: Message[];
  loading?: boolean;
  /**
   * Quando informado, ativa o scroll infinito: ao chegar no topo da lista,
   * busca mensagens mais antigas via /api/conversations/[id]/messages?before=...
   * Em modo "Todas as conversas" (sem id), o scroll infinito fica desabilitado.
   */
  conversationId?: string | null;
}

const PAGE_LIMIT = 50;

export function ConversationThread({ messages, loading = false, conversationId }: ConversationThreadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Reset paginação ao trocar de conversa.
  useEffect(() => {
    setOlderMessages([]);
    setHasMore(true);
    setIsLoadingMore(false);
    lastMessageIdRef.current = null;
  }, [conversationId]);

  const allMessages = olderMessages.length === 0 ? messages : [...olderMessages, ...messages];

  // Auto-scroll para a última mensagem somente quando uma nova mensagem chega
  // no fim (id muda). Evita reset de scroll ao prepend de mensagens antigas.
  useEffect(() => {
    if (allMessages.length === 0) return;
    const lastId = allMessages[allMessages.length - 1].id;
    if (lastId !== lastMessageIdRef.current) {
      const isFirstRender = lastMessageIdRef.current === null;
      lastMessageIdRef.current = lastId;
      endRef.current?.scrollIntoView({ behavior: isFirstRender ? 'auto' : 'smooth' });
    }
  }, [allMessages]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || !hasMore || isLoadingMore) return;
    const oldest = olderMessages[0] ?? messages[0];
    if (!oldest) return;

    const container = containerRef.current;
    const previousHeight = container?.scrollHeight ?? 0;
    const previousScrollTop = container?.scrollTop ?? 0;

    setIsLoadingMore(true);
    try {
      const url = `/api/conversations/${conversationId}/messages?before=${encodeURIComponent(oldest.sentAt)}&limit=${PAGE_LIMIT}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load older messages: ${res.status}`);
      const json = (await res.json()) as { data: Message[]; hasMore: boolean };
      setOlderMessages(prev => [...json.data, ...prev]);
      setHasMore(json.hasMore);

      // Preserva scroll após prepend (ajusta scrollTop pelo delta de altura).
      requestAnimationFrame(() => {
        if (container) {
          const newHeight = container.scrollHeight;
          container.scrollTop = previousScrollTop + (newHeight - previousHeight);
        }
      });
    } catch (err) {
      console.error('[ConversationThread] loadOlder failed', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [conversationId, hasMore, isLoadingMore, olderMessages, messages]);

  // IntersectionObserver no topo: ao entrar em view, dispara loadOlder.
  useEffect(() => {
    if (!conversationId || !hasMore) return;
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          void loadOlder();
        }
      },
      { root: containerRef.current, rootMargin: '100px 0px 0px 0px', threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [conversationId, hasMore, loadOlder]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-slate-400">Carregando mensagens...</p>
      </div>
    );
  }

  if (allMessages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center px-4">
          Nenhuma mensagem ainda.<br />Envie a primeira mensagem!
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-0.5 bg-[#efeae2] dark:bg-[#0b141a] bg-dots">
      {conversationId && hasMore && (
        <div ref={topSentinelRef} className="flex justify-center py-2">
          {isLoadingMore ? (
            <Loader2 size={14} className="animate-spin text-slate-400" />
          ) : (
            <span className="text-[10px] text-slate-400">Role para carregar mensagens antigas</span>
          )}
        </div>
      )}
      {allMessages.map(msg => (
        <MessageBubble key={msg.id} message={msg} showChannelBadge={true} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
