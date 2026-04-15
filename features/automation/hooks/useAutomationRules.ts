'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface AutomationRule {
  id: string;
  name: string;
  board_id: string | null;
  trigger_type: 'deal_created' | 'stage_entered' | 'days_in_stage' | 'response_received';
  trigger_config: Record<string, unknown>;
  action_type: 'send_whatsapp' | 'send_email' | 'move_stage' | 'move_to_next_board';
  action_config: Record<string, unknown>;
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAutomationRuleInput {
  name: string;
  boardId: string | null;
  triggerType: AutomationRule['trigger_type'];
  triggerConfig: Record<string, unknown>;
  actionType: AutomationRule['action_type'];
  actionConfig: Record<string, unknown>;
  isActive: boolean;
}

export interface UpdateAutomationRuleInput extends Partial<CreateAutomationRuleInput> {
  id: string;
}

const queryKey = ['automation-rules'] as const;

export function useAutomationRules() {
  return useQuery<AutomationRule[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch('/api/automation-rules');
      if (!res.ok) throw new Error(`Failed to load rules: ${res.status}`);
      const data = await res.json() as { data: AutomationRule[] };
      return data.data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useCreateAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAutomationRuleInput) => {
      const res = await fetch('/api/automation-rules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao criar regra');
      return data.data as AutomationRule;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
}

export function useUpdateAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateAutomationRuleInput) => {
      const { id, ...patch } = input;
      const res = await fetch(`/api/automation-rules/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao atualizar');
      return data.data as AutomationRule;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
}

export function useDeleteAutomationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/automation-rules/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Falha ao remover');
      }
      return true;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
}
