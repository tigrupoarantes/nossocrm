'use client';

import React from 'react';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import type { Message, MessageStatus } from '@/types';
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

/**
 * Renderiza o indicador de status estilo WhatsApp Web:
 *   sending   → relógio cinza
 *   sent      → ✓ cinza
 *   delivered → ✓✓ cinza
 *   read      → ✓✓ azul
 *   failed    → ⚠️ vermelho
 */
function StatusIndicator({ status }: { status: MessageStatus }) {
  // Cores oficiais WhatsApp Web: cinza #aebac1, azul read #53bdeb
  switch (status) {
    case 'sending':
      return <Clock size={12} className="text-[#aebac1]" aria-label="Enviando" />;
    case 'sent':
      return <Check size={14} className="text-[#aebac1]" aria-label="Enviada" />;
    case 'delivered':
      return <CheckCheck size={14} className="text-[#aebac1]" aria-label="Entregue" />;
    case 'read':
      return <CheckCheck size={14} className="text-[#53bdeb]" aria-label="Lida" />;
    case 'failed':
      return <AlertCircle size={12} className="text-red-400" aria-label="Falhou" />;
    default:
      return null;
  }
}

export function MessageBubble({ message, showChannelBadge = true }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const isSending = message.status === 'sending';
  const isFailed = message.status === 'failed';

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-1.5`}>
      <div
        className={`max-w-[72%] rounded-lg px-3 py-1.5 text-sm shadow-md ${
          isOutbound
            ? `bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-white rounded-br-sm ${isSending ? 'opacity-80' : ''} ${isFailed ? 'ring-1 ring-red-400/60' : ''}`
            : 'bg-white text-[#111b21] dark:bg-[#202c33] dark:text-white rounded-bl-sm'
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

        {/* Rodapé: hora + ticks + badge de canal */}
        <div className={`flex items-center gap-1 mt-0.5 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-[11px] ${isOutbound ? 'text-[#667781] dark:text-[#aebac1]' : 'text-[#667781] dark:text-[#8696a0]'}`}>
            {formatTime(message.sentAt)}
          </span>
          {showChannelBadge && message.channel !== 'whatsapp' && (
            <ChannelIcon channel={message.channel} size={12} />
          )}
          {isOutbound && <StatusIndicator status={message.status} />}
        </div>
      </div>
    </div>
  );
}
