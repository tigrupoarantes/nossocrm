'use client';

import React from 'react';
import { Check, CheckCheck, Clock, AlertCircle, FileText, Download } from 'lucide-react';
import type { Message, MessageStatus } from '@/types';
import { ChannelIcon } from './ChannelBadge';

/** Extrai nome de arquivo amigável de URL ou metadata. */
function extractFilename(message: Message): string {
  const fromMeta = (message.metadata as Record<string, unknown> | null)?.filename;
  if (typeof fromMeta === 'string' && fromMeta.length > 0) return fromMeta;
  if (!message.mediaUrl) return 'arquivo';
  try {
    const url = new URL(message.mediaUrl);
    const last = url.pathname.split('/').pop() || 'arquivo';
    // path tem o formato "<orgId>/<timestamp>-<uuid>.ext" — remover prefixo timestamp
    return decodeURIComponent(last.replace(/^\d+-/, ''));
  } catch {
    return 'arquivo';
  }
}

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
          <a href={message.mediaUrl} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.mediaUrl}
              alt="Imagem"
              loading="lazy"
              decoding="async"
              className="mb-2 rounded-lg max-w-full max-h-48 object-cover cursor-zoom-in"
            />
          </a>
        )}

        {message.mediaUrl && message.messageType === 'audio' && (
          <audio
            controls
            src={message.mediaUrl}
            className="mb-1 w-full min-w-55 max-w-75"
            preload="metadata"
          >
            Seu navegador não suporta áudio.
          </audio>
        )}

        {message.mediaUrl && message.messageType === 'video' && (
          <video
            controls
            src={message.mediaUrl}
            className="mb-2 rounded-lg max-w-full max-h-64"
            preload="metadata"
          >
            Seu navegador não suporta vídeo.
          </video>
        )}

        {message.mediaUrl && (message.messageType === 'file' || (message.messageType as string) === 'document') && (
          <a
            href={message.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            className={`mb-1 flex items-center gap-2 rounded-lg p-2 transition-colors ${
              isOutbound
                ? 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10'
                : 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10'
            }`}
          >
            <FileText size={24} className="shrink-0 text-[#54656f] dark:text-[#aebac1]" />
            <span className="text-xs truncate flex-1">{extractFilename(message)}</span>
            <Download size={14} className="shrink-0 text-[#54656f] dark:text-[#aebac1]" />
          </a>
        )}

        {/* Corpo da mensagem (caption em mídia, ou texto puro) */}
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
