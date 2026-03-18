'use client';

import React from 'react';
import type { Message } from '@/types';
import { ChannelIcon } from './ChannelBadge';

interface MessageBubbleProps {
  message: Message;
  showChannelBadge?: boolean;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function MessageBubble({ message, showChannelBadge = true }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[72%] rounded-2xl px-4 py-2 text-sm ${
          isOutbound
            ? 'bg-green-500 text-white rounded-br-sm'
            : 'bg-white dark:bg-dark-card text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-bl-sm'
        }`}
      >
        {/* Mídia */}
        {message.mediaUrl && message.messageType === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.mediaUrl}
            alt="Imagem"
            className="mb-2 rounded-lg max-w-full max-h-48 object-cover"
          />
        )}

        {/* Corpo da mensagem */}
        {message.body && (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        )}

        {/* Rodapé: hora + badge de canal */}
        <div className={`flex items-center gap-1.5 mt-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-[10px] ${isOutbound ? 'text-green-100' : 'text-slate-400 dark:text-slate-500'}`}>
            {formatTime(message.sentAt)}
          </span>
          {showChannelBadge && message.channel !== 'whatsapp' && (
            <span className="text-[10px]">
              <ChannelIcon channel={message.channel} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
