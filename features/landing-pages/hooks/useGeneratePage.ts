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
  onChunk?: (partial: string) => void;
}

interface GeneratePageResult {
  html: string;
  model: string;
}

export function useGeneratePage() {
  return useMutation({
    mutationFn: async ({ onChunk, ...params }: GeneratePageParams): Promise<GeneratePageResult> => {
      const res = await fetch('/api/landing-pages/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const errMsg = typeof err.error === 'string'
          ? err.error
          : (err.error?.message ?? 'Erro ao gerar landing page. Tente novamente.');
        throw new Error(errMsg);
      }

      // Read plain text stream from toTextStreamResponse()
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        onChunk?.(fullText);
      }

      if (!fullText.trim()) {
        throw new Error('A IA não retornou conteúdo. Tente novamente.');
      }

      return { html: fullText.trim(), model: 'stream' };
    },
  });
}
