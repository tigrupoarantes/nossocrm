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
      const res = await fetch('/api/landing-pages/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Erro ao gerar landing page. Tente novamente.');
      }

      return res.json();
    },
  });
}
