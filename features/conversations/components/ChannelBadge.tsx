'use client';

import React from 'react';
import type { ConversationChannel } from '@/types';

interface ChannelBadgeProps {
  channel: ConversationChannel;
  size?: 'sm' | 'md';
}

const CHANNEL_CONFIG: Record<ConversationChannel, { label: string; emoji: string; className: string }> = {
  whatsapp: {
    label: 'WhatsApp',
    emoji: '📱',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  instagram: {
    label: 'Instagram',
    emoji: '📷',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  facebook: {
    label: 'Messenger',
    emoji: '💬',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  email: {
    label: 'E-mail',
    emoji: '✉️',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
};

export function ChannelBadge({ channel, size = 'sm' }: ChannelBadgeProps) {
  const config = CHANNEL_CONFIG[channel] ?? CHANNEL_CONFIG.whatsapp;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${config.className} ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
      }`}
    >
      <span aria-hidden="true">{config.emoji}</span>
      {config.label}
    </span>
  );
}

/** Retorna apenas o emoji do canal (para uso em badges compactos). */
export function ChannelIcon({ channel }: { channel: ConversationChannel }) {
  const config = CHANNEL_CONFIG[channel] ?? CHANNEL_CONFIG.whatsapp;
  return <span aria-label={config.label}>{config.emoji}</span>;
}
