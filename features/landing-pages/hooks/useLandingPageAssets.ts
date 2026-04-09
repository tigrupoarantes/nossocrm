'use client';

import { useMutation } from '@tanstack/react-query';
import { uploadLandingPageImage } from '@/lib/supabase/landingPageAssets';

interface UploadParams {
  orgId: string;
  lpId: string;
  file: File;
}

/**
 * Hook para upload de imagens em landing pages.
 * Retorna a URL pública da imagem no Supabase Storage.
 */
export function useUploadLandingPageImage() {
  return useMutation({
    mutationFn: async ({ orgId, lpId, file }: UploadParams) => {
      const { url, error } = await uploadLandingPageImage(orgId, lpId, file);
      if (error || !url) throw error ?? new Error('Falha no upload da imagem.');
      return url;
    },
  });
}
