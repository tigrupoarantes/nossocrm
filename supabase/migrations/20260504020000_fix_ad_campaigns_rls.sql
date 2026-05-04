-- =============================================================================
-- FIX: ad_campaigns_service estava com FOR ALL ... WITH CHECK (true), o que
-- permite cross-tenant write via supabase-js client autenticado (qualquer
-- user logado consegue UPDATE em ad_campaigns de outra org). A migration
-- 20260410000000_harden_rls_security_audit deveria ter corrigido isso, mas
-- o bloco nao chegou a aplicar no remoto.
--
-- Aqui substituimos por policy restrita a admin/owner/manager da propria
-- organizacao. service_role bypassa RLS por padrao - nao precisa policy
-- especifica para ele. ad_campaigns_select (SELECT por membros da org)
-- permanece intacta.
-- =============================================================================

DROP POLICY IF EXISTS ad_campaigns_service ON public.ad_campaigns;
DROP POLICY IF EXISTS ad_campaigns_admin_manage ON public.ad_campaigns;

CREATE POLICY ad_campaigns_admin_manage ON public.ad_campaigns
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner', 'manager')
  ));
