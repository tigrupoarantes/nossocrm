'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LandingPage, LandingPageStatus } from '@/types';

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
      return json as { data: Partial<LandingPage>[]; totalCount: number };
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
      return json.data as LandingPage;
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
      return (await res.json()).data as LandingPage;
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
      return (await res.json()).data as LandingPage;
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
