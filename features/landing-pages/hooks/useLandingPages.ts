'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LandingPage, LandingPageField, LandingPageStatus } from '@/types';

// =============================================================================
// Mapper: converte row do Supabase (snake_case) → LandingPage (camelCase)
// =============================================================================

function mapLandingPage(raw: Record<string, unknown>): LandingPage {
  return {
    id: raw.id as string,
    organizationId: raw.organization_id as string,
    title: raw.title as string,
    slug: raw.slug as string,
    description: raw.description as string | null,
    htmlContent: (raw.html_content ?? '') as string,
    promptUsed: raw.prompt_used as string | null,
    aiModel: raw.ai_model as string | null,
    targetBoardId: raw.target_board_id as string | null,
    targetStageId: raw.target_stage_id as string | null,
    webhookApiKey: (raw.webhook_api_key ?? '') as string,
    customFields: (raw.custom_fields ?? []) as LandingPageField[],
    thankYouMessage: (raw.thank_you_message ?? '') as string,
    thankYouRedirectUrl: raw.thank_you_redirect_url as string | null,
    metaTitle: raw.meta_title as string | null,
    metaDescription: raw.meta_description as string | null,
    ogImageUrl: raw.og_image_url as string | null,
    googleAnalyticsId: raw.google_analytics_id as string | null,
    metaPixelId: raw.meta_pixel_id as string | null,
    status: raw.status as LandingPageStatus,
    publishedAt: raw.published_at as string | null,
    viewsCount: (raw.views_count ?? 0) as number,
    submissionsCount: (raw.submissions_count ?? 0) as number,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
    createdBy: raw.created_by as string | null,
  };
}

// =============================================================================
// Query Keys
// =============================================================================

export const landingPageKeys = {
  all: ['landing-pages'] as const,
  lists: () => [...landingPageKeys.all, 'list'] as const,
  list: (status?: string) => [...landingPageKeys.lists(), { status }] as const,
  detail: (id: string) => [...landingPageKeys.all, 'detail', id] as const,
  submissions: (id: string) => [...landingPageKeys.all, 'submissions', id] as const,
};

// =============================================================================
// List
// =============================================================================

export function useLandingPages(status?: LandingPageStatus) {
  return useQuery({
    queryKey: landingPageKeys.list(status),
    queryFn: async () => {
      const url = status ? `/api/landing-pages?status=${status}` : '/api/landing-pages';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erro ao buscar landing pages');
      const json = await res.json();
      return {
        data: (json.data as Record<string, unknown>[]).map(mapLandingPage),
        totalCount: json.totalCount as number,
      };
    },
  });
}

// =============================================================================
// Detail
// =============================================================================

export function useLandingPage(id: string | null) {
  return useQuery({
    queryKey: landingPageKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/landing-pages/${id}`);
      if (!res.ok) throw new Error('Erro ao buscar landing page');
      const json = await res.json();
      return mapLandingPage(json.data as Record<string, unknown>);
    },
    enabled: !!id,
  });
}

// =============================================================================
// Create
// =============================================================================

export function useCreateLandingPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<LandingPage>) => {
      const res = await fetch('/api/landing-pages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Erro ao criar landing page');
      }
      const json = await res.json();
      return mapLandingPage(json.data as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: landingPageKeys.lists() });
    },
  });
}

// =============================================================================
// Update
// =============================================================================

export function useUpdateLandingPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<LandingPage>) => {
      const res = await fetch(`/api/landing-pages/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Erro ao salvar landing page');
      }
      const json = await res.json();
      return mapLandingPage(json.data as Record<string, unknown>);
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData(landingPageKeys.detail(variables.id), data);
      queryClient.invalidateQueries({ queryKey: landingPageKeys.lists() });
    },
  });
}

// =============================================================================
// Publish
// =============================================================================

export function usePublishLandingPage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/landing-pages/${id}/publish`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Erro ao publicar landing page');
      }
      return (await res.json()).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: landingPageKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: landingPageKeys.lists() });
    },
  });
}

// =============================================================================
// Delete (archive)
// =============================================================================

export function useDeleteLandingPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/landing-pages/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao arquivar landing page');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: landingPageKeys.lists() });
    },
  });
}

// =============================================================================
// Unpublish
// =============================================================================

export function useUnpublishLandingPage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/landing-pages/${id}/unpublish`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Erro ao despublicar landing page');
      }
      return (await res.json()).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: landingPageKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: landingPageKeys.lists() });
    },
  });
}

// =============================================================================
// Submissions
// =============================================================================

export function useLandingPageSubmissions(id: string) {
  return useQuery({
    queryKey: landingPageKeys.submissions(id),
    queryFn: async () => {
      const res = await fetch(`/api/landing-pages/${id}/submissions`);
      if (!res.ok) throw new Error('Erro ao buscar submissões');
      return (await res.json()) as { data: unknown[]; totalCount: number };
    },
    enabled: !!id,
  });
}
