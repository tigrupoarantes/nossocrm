import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';

/**
 * Retorna o nome da organização do usuário logado.
 * Útil para contexto de IA e exibição em UI.
 */
export function useOrganizationName() {
  const { organizationId } = useAuth();

  return useQuery({
    queryKey: ['organization-name', organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId!)
        .single();
      return data?.name as string | null;
    },
    enabled: !!organizationId,
    staleTime: Infinity,
  });
}
