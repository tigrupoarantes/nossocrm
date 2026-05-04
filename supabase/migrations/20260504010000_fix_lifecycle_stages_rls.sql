-- =============================================================================
-- FIX: lifecycle_stages e tabela GLOBAL (sem organization_id) - a migration
-- 20260330000000_harden_rls_policies tentou criar policy multi-tenant nela
-- referenciando organization_id, falhou (coluna nao existe) e o bloco nao
-- chegou a aplicar no remoto. Aqui substituimos pela policy correta para
-- tabela global: leitura para todos os usuarios autenticados (sem dado
-- sensivel por organizacao - apenas tipos lifecycle padrao).
-- =============================================================================

DROP POLICY IF EXISTS "Enable all access for authenticated users"
  ON public.lifecycle_stages;
DROP POLICY IF EXISTS "Members can view lifecycle_stages"
  ON public.lifecycle_stages;
DROP POLICY IF EXISTS "Members can manage lifecycle_stages"
  ON public.lifecycle_stages;

CREATE POLICY "Authenticated can view lifecycle_stages"
  ON public.lifecycle_stages
  FOR SELECT TO authenticated
  USING (true);
