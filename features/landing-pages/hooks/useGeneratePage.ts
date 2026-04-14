'use client';

import { useMutation } from '@tanstack/react-query';
import type { LandingPageField } from '@/types';
import { postProcessHtml } from '../lib/html-postprocess';

interface GeneratePageParams {
  prompt: string;
  orgName?: string;
  webhookUrl: string;
  apiKey: string;
  formFields?: LandingPageField[];
  thankYouMessage?: string;
  thankYouRedirectUrl?: string | null;
  currentHtml?: string;          // presente em refinamentos iterativos
  onChunk?: (partial: string) => void; // callback para preview ao vivo
}

interface GeneratePageResult {
  html: string;
  model: string;
}

export function useGeneratePage() {
  return useMutation({
    mutationFn: async ({ onChunk, ...params }: GeneratePageParams): Promise<GeneratePageResult> => {
      const controller = new AbortController();
      // Alinhado com maxDuration=300s do server. O client precisa esperar
      // mais que o server pra deixar a IA terminar — abortar antes era
      // causa de "página em branco" quando a IA leva 120-180s.
      const timeout = setTimeout(() => controller.abort(), 310_000);

      try {
        const res = await fetch('/api/landing-pages/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(params),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const errMsg = typeof err.error === 'string'
            ? err.error
            : (err.error?.message ?? 'Erro ao gerar landing page. Tente novamente.');
          throw new Error(errMsg);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
          onChunk?.(fullText); // preview ao vivo — passa o HTML acumulado até agora
        }

        fullText += decoder.decode(); // flush bytes restantes

        if (!fullText.trim()) {
          throw new Error('A IA não retornou conteúdo. Tente novamente.');
        }

        // Strip markdown code fences (alguns modelos adicionam mesmo instruídos a não fazer)
        const cleaned = fullText.trim()
          .replace(/^```(?:html)?\s*/i, '')
          .replace(/\s*```\s*$/, '')
          .trim();

        // Validação anti-truncamento: a IA pode bater em max_tokens e cortar a página
        // no meio (causa de bug crítico — landing salva sem form de captura, sem CTA
        // final, sem footer). Se o HTML não termina com </html>, recusamos salvar.
        const endsClean = /<\/html\s*>\s*$/i.test(cleaned);
        if (!endsClean) {
          throw new Error(
            'A IA gerou uma página INCOMPLETA (atingiu o limite de tokens). ' +
            'Tente um briefing mais conciso ou peça para a IA cortar uma seção opcional. ' +
            'A página NÃO foi salva para evitar publicar conteúdo truncado.'
          );
        }

        // Post-processa: garante design tokens, fonts, Tailwind CDN, motion script
        const processed = postProcessHtml(cleaned);

        return { html: processed, model: 'stream' };
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
