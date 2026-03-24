'use client';

import { useMutation } from '@tanstack/react-query';
import type { LandingPageField } from '@/types';

interface GeneratePageParams {
  prompt: string;
  orgName?: string;
  webhookUrl: string;
  apiKey: string;
  formFields?: LandingPageField[];
  thankYouMessage?: string;
  thankYouRedirectUrl?: string | null;
}

interface GeneratePageResult {
  html: string;
  model: string;
}

export function useGeneratePage() {
  return useMutation({
    mutationFn: async (params: GeneratePageParams): Promise<GeneratePageResult> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 110_000); // 110s — antes do maxDuration do servidor

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

        // Accumulate plain text stream from toTextStreamResponse()
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
        }

        // Flush remaining bytes
        fullText += decoder.decode();

        if (!fullText.trim()) {
          throw new Error('A IA não retornou conteúdo. Tente novamente.');
        }

        // Strip markdown code fences se o modelo insistir em adicioná-los
        const cleaned = fullText.trim()
          .replace(/^```(?:html)?\s*/i, '')
          .replace(/\s*```\s*$/, '')
          .trim();

        return { html: cleaned, model: 'stream' };
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
