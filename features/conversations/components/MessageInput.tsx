'use client';

import React, { useState, useRef } from 'react';
import { Send, Loader2 } from 'lucide-react';
import type { ConversationChannel } from '@/types';

interface MessageInputProps {
  onSend: (body: string, channel: ConversationChannel) => Promise<void>;
  availableChannels: ConversationChannel[];
  defaultChannel?: ConversationChannel;
  disabled?: boolean;
  isSending?: boolean;
}

const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  whatsapp: '📱 WhatsApp',
  instagram: '📷 Instagram',
  facebook: '💬 Messenger',
  email: '✉️ E-mail',
};

export function MessageInput({
  onSend,
  availableChannels,
  defaultChannel,
  disabled = false,
  isSending = false,
}: MessageInputProps) {
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<ConversationChannel>(
    defaultChannel ?? availableChannels[0] ?? 'whatsapp'
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed || isSending || disabled) return;
    await onSend(trimmed, channel);
    setBody('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.focus();
    }
  };

  return (
    <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10 space-y-2">
      {/* Seletor de canal (só aparece se há mais de um canal disponível) */}
      {availableChannels.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Canal:</span>
          <select
            value={channel}
            onChange={e => setChannel(e.target.value as ConversationChannel)}
            className="text-xs bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {availableChannels.map(ch => (
              <option key={ch} value={ch}>
                {CHANNEL_LABELS[ch]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Textarea (Shift+Enter = nova linha, Enter = enviar) + botão enviar */}
      <div className="flex gap-2 items-end">
        <textarea
          ref={inputRef}
          rows={1}
          value={body}
          onChange={e => setBody(e.target.value)}
          onInput={e => autoGrow(e.currentTarget)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Digite uma mensagem... (Shift+Enter para nova linha)"
          disabled={disabled || isSending}
          className="flex-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 resize-none max-h-32 leading-snug"
        />
        <button
          onClick={() => void handleSend()}
          disabled={isSending || !body.trim() || disabled}
          className="shrink-0 w-10 h-10 flex items-center justify-center bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Enviar mensagem"
        >
          {isSending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
