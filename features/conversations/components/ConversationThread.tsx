'use client';

import React, { useEffect, useRef } from 'react';
import type { Message } from '@/types';
import { MessageBubble } from './MessageBubble';

interface ConversationThreadProps {
  messages: Message[];
  loading?: boolean;
}

export function ConversationThread({ messages, loading = false }: ConversationThreadProps) {
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-slate-400">Carregando mensagens...</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center px-4">
          Nenhuma mensagem ainda.<br />Envie a primeira mensagem!
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-0.5 bg-[#efeae2] dark:bg-[#0b141a] bg-dots">
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} showChannelBadge={true} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
