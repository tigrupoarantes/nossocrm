'use client';

import * as React from 'react';
import Link from 'next/link';
import { HelpCircle, ExternalLink } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

interface HelpPopoverProps {
  /** Título curto exibido em negrito no topo do popover. */
  title?: string;
  /** Texto explicativo (pt-BR, narrativo). Pode quebrar em parágrafos com \n\n. */
  description: React.ReactNode;
  /** Slug do artigo completo na Central de Ajuda. Renderiza link "Ver tutorial completo". */
  articleSlug?: string;
  /** Tamanho do ícone (px). */
  size?: number;
  /** Classe adicional pro botão (alinhamento, cor). */
  className?: string;
}

/**
 * Ícone "?" pequeno que abre um popover explicativo.
 * Use ao lado de labels de campos ou opções confusas para guiar o usuário sem
 * tirar ele da tela. Quando há `articleSlug`, oferece link pro tutorial completo.
 */
export function HelpPopover({
  title,
  description,
  articleSlug,
  size = 14,
  className,
}: HelpPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Ajuda"
          className={
            'inline-flex items-center justify-center text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors align-middle ' +
            (className ?? '')
          }
        >
          <HelpCircle size={size} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="text-sm space-y-2">
        {title && (
          <div className="font-semibold text-slate-900 dark:text-white">{title}</div>
        )}
        <div className="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
          {description}
        </div>
        {articleSlug && (
          <Link
            href={`/help?slug=${encodeURIComponent(articleSlug)}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline pt-1"
          >
            Ver tutorial completo <ExternalLink size={11} />
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
}
