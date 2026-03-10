import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export interface AutomationExecution {
  id: string;
  ruleId: string;
  ruleName: string;
  actionType: string;
  success: boolean;
  result: Record<string, unknown> | null;
  executedAt: string;
}

export function useAutomationHistory(dealId: string | undefined) {
  return useQuery({
    queryKey: ['automation-history', dealId],
    enabled: !!dealId && !!supabase,
    queryFn: async () => {
      if (!supabase || !dealId) return [];

      const { data, error } = await supabase
        .from('automation_executions')
        .select(`
          id,
          action_type,
          success,
          result,
          executed_at,
          automation_rules (
            id,
            name
          )
        `)
        .eq('deal_id', dealId)
        .order('executed_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return (data ?? []).map((e: any) => ({
        id: e.id,
        ruleId: e.automation_rules?.id ?? '',
        ruleName: e.automation_rules?.name ?? e.action_type,
        actionType: e.action_type,
        success: e.success,
        result: e.result ?? null,
        executedAt: e.executed_at,
      })) as AutomationExecution[];
    },
    staleTime: 30_000,
  });
}
