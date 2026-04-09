'use client';

import { useEffect } from 'react';

/**
 * Escuta erros de ChunkLoadError globalmente e recarrega a página.
 * Acontece quando o SW ou browser cache serve referências a chunks
 * de um deploy antigo que não existem mais no servidor.
 */
export function ChunkErrorHandler() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      const msg = event.error?.name || event.message || '';
      if (
        msg.includes('ChunkLoadError') ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch dynamically imported module')
      ) {
        // Marca pra não loopear se o reload também falhar
        const key = 'crm-chunk-reload';
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          window.location.reload();
        }
      }
    }

    function handleRejection(event: PromiseRejectionEvent) {
      const msg = String(event.reason?.name || event.reason?.message || event.reason || '');
      if (
        msg.includes('ChunkLoadError') ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch dynamically imported module')
      ) {
        const key = 'crm-chunk-reload';
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          window.location.reload();
        }
      }
    }

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    // Limpa a flag de reload quando a página carrega com sucesso
    sessionStorage.removeItem('crm-chunk-reload');

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
