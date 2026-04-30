'use client';

import * as React from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, X } from 'lucide-react';

interface FirstTimeBannerProps {
  /** Slug do artigo na Central de Ajuda. Usado pro link e pra chave do dismissal. */
  articleSlug: string;
  /** Título grande do banner. */
  title: string;
  /** Subtítulo / descrição curta. */
  description: string;
  /** Texto do botão. Default "Ver tutorial passo a passo". */
  ctaLabel?: string;
  /**
   * Quando true, esconde o banner — usar para sumir após o usuário ter
   * cumprido o passo (ex.: WAHA conectado, regra criada).
   */
  hidden?: boolean;
  /** Permite o usuário fechar manualmente. Default true. Persiste em localStorage. */
  dismissible?: boolean;
  /** Classe adicional pro container externo. */
  className?: string;
}

const STORAGE_PREFIX = 'nossocrm:help-banner-dismissed:';

/**
 * Card destacado que convida o usuário a ler o tutorial passo-a-passo.
 * Aparece em telas críticas (configurar WhatsApp, criar automação) quando o
 * usuário ainda não cumpriu a configuração (`hidden=false`). Some quando ele
 * cumpriu (`hidden=true`) ou clica no X (persistência local).
 */
export function FirstTimeBanner({
  articleSlug,
  title,
  description,
  ctaLabel = 'Ver tutorial passo a passo',
  hidden = false,
  dismissible = true,
  className,
}: FirstTimeBannerProps) {
  const [dismissed, setDismissed] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_PREFIX + articleSlug);
      setDismissed(v === '1');
    } catch {
      setDismissed(false);
    }
  }, [articleSlug]);

  if (hidden || dismissed === null || dismissed) return null;

  const onDismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + articleSlug, '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  return (
    <div
      className={
        'relative overflow-hidden rounded-2xl border border-primary-200 dark:border-primary-500/30 bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 p-5 ' +
        (className ?? '')
      }
    >
      <div className="flex items-start gap-4">
        <div className="hidden sm:flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/70 dark:bg-white/5 text-primary-600 dark:text-primary-400">
          <Sparkles size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-400 mb-1">
            Primeira vez aqui?
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug mb-1">
            {title}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3 leading-relaxed">
            {description}
          </p>
          <Link
            href={`/help?slug=${encodeURIComponent(articleSlug)}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 dark:text-primary-400 hover:gap-2.5 transition-all"
          >
            {ctaLabel} <ArrowRight size={14} />
          </Link>
        </div>
        {dismissible && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Fechar"
            className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
