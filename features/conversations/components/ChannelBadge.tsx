'use client';

import React from 'react';
import type { ConversationChannel } from '@/types';

// ---------------------------------------------------------------------------
// SVG icons — logos oficiais simplificadas
// ---------------------------------------------------------------------------

function WhatsAppSvg({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2Zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.16 8.16 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c.01 4.54-3.68 8.23-8.22 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.27Z"
        fill="#25D366"
      />
    </svg>
  );
}

function InstagramSvg({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig-grad)" />
      <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.5" fill="none" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="white" />
      <rect x="4" y="4" width="16" height="16" rx="4" stroke="white" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function FacebookSvg({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fb-msg-grad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#00C6FF" />
          <stop offset="100%" stopColor="#0078FF" />
        </linearGradient>
      </defs>
      <path
        d="M12 2C6.477 2 2 6.145 2 11.243c0 2.9 1.434 5.487 3.678 7.18V22l3.38-1.858c.9.25 1.856.384 2.842.384h.1c5.523 0 10-4.145 10-9.243S17.523 2 12 2Z"
        fill="url(#fb-msg-grad)"
      />
      <path
        d="m5.5 14.243 3.178-5.046L12.6 12.1l3.722-5.046L13 12.1l-3.922-2.903L5.5 14.243Z"
        fill="white"
      />
    </svg>
  );
}

function EmailSvg({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4" width="20" height="16" rx="3" fill="#64748b" />
      <path d="M2 7l10 6 10-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Mapa de configuração por canal
// ---------------------------------------------------------------------------

const CHANNEL_CONFIG: Record<ConversationChannel, { label: string; badgeClassName: string }> = {
  whatsapp: {
    label: 'WhatsApp',
    badgeClassName: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  instagram: {
    label: 'Instagram',
    badgeClassName: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  facebook: {
    label: 'Messenger',
    badgeClassName: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  email: {
    label: 'E-mail',
    badgeClassName: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
};

const CHANNEL_ICON_MAP: Record<ConversationChannel, React.FC<{ size?: number }>> = {
  whatsapp: WhatsAppSvg,
  instagram: InstagramSvg,
  facebook: FacebookSvg,
  email: EmailSvg,
};

// ---------------------------------------------------------------------------
// Componentes exportados
// ---------------------------------------------------------------------------

interface ChannelBadgeProps {
  channel: ConversationChannel;
  size?: 'sm' | 'md';
}

export function ChannelBadge({ channel, size = 'sm' }: ChannelBadgeProps) {
  const config = CHANNEL_CONFIG[channel] ?? CHANNEL_CONFIG.whatsapp;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${config.badgeClassName} ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
      }`}
    >
      <ChannelIcon channel={channel} size={size === 'sm' ? 12 : 14} />
      {config.label}
    </span>
  );
}

/** Renderiza o ícone SVG do canal (logo oficial). */
export function ChannelIcon({ channel, size = 16 }: { channel: ConversationChannel; size?: number }) {
  const Icon = CHANNEL_ICON_MAP[channel] ?? CHANNEL_ICON_MAP.whatsapp;
  const label = CHANNEL_CONFIG[channel]?.label ?? 'WhatsApp';
  return (
    <span className="inline-flex items-center shrink-0" role="img" aria-label={label}>
      <Icon size={size} />
    </span>
  );
}
