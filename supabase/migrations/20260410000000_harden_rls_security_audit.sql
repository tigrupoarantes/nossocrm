-- =============================================================================
-- SECURITY HARDENING — Auditoria de segurança Abril 2026
--
-- Corrige:
-- 1. ad_campaigns: policy FOR ALL WITH CHECK (true) → org-scoped
-- 2. ad_lead_events: policy INSERT WITH CHECK (true) → org-scoped
-- 3. prospecting_dispatches: policy INSERT WITH CHECK (true) → org-scoped
-- 4. mass_dispatch_recipients: policy FOR ALL WITH CHECK (true) → org-scoped
-- 5. super_agent_logs: policy INSERT WITH CHECK (true) → org-scoped
-- 6. ai_credit_transactions: policy INSERT WITH CHECK (true) → org-scoped
-- 7. get_contact_stage_counts(): adiciona filtro organization_id
-- 8. profiles: restringe SELECT para mesma org (remove USING true)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ad_campaigns — restringir a membros da org
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "ad_campaigns_service" ON public.ad_campaigns;

CREATE POLICY "Members can view ad campaigns"
  ON public.ad_campaigns FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Service role can manage ad campaigns"
  ON public.ad_campaigns FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Members can update own org ad campaigns"
  ON public.ad_campaigns FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- -----------------------------------------------------------------------------
-- 2. ad_lead_events — restringir insert a membros da org
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "ad_lead_events_insert" ON public.ad_lead_events;

CREATE POLICY "Members can view ad lead events"
  ON public.ad_lead_events FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can insert ad lead events"
  ON public.ad_lead_events FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- -----------------------------------------------------------------------------
-- 3. prospecting_dispatches — restringir insert a membros da org
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can insert dispatches" ON public.prospecting_dispatches;

CREATE POLICY "Org members can view prospecting dispatches"
  ON public.prospecting_dispatches FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can insert prospecting dispatches"
  ON public.prospecting_dispatches FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- -----------------------------------------------------------------------------
-- 4. mass_dispatch_recipients — restringir a membros da org
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "mass_dispatch_recipients_service" ON public.mass_dispatch_recipients;

CREATE POLICY "Members can view dispatch recipients"
  ON public.mass_dispatch_recipients FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can insert dispatch recipients"
  ON public.mass_dispatch_recipients FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can update dispatch recipients"
  ON public.mass_dispatch_recipients FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- -----------------------------------------------------------------------------
-- 5. super_agent_logs — restringir insert a membros da org
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can insert logs" ON public.super_agent_logs;

CREATE POLICY "Members can view super agent logs"
  ON public.super_agent_logs FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can insert super agent logs"
  ON public.super_agent_logs FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- -----------------------------------------------------------------------------
-- 6. ai_credit_transactions — restringir insert a membros da org
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Service role can insert transactions" ON public.ai_credit_transactions;

CREATE POLICY "Members can view credit transactions"
  ON public.ai_credit_transactions FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Org members can insert credit transactions"
  ON public.ai_credit_transactions FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- -----------------------------------------------------------------------------
-- 7. get_contact_stage_counts() — adicionar filtro de org
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_contact_stage_counts()
RETURNS TABLE (stage TEXT, count BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT c.stage, COUNT(*)::BIGINT as count
  FROM contacts c
  WHERE c.deleted_at IS NULL
    AND c.organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  GROUP BY c.stage;
$$;

-- -----------------------------------------------------------------------------
-- 8. profiles — restringir SELECT para mesma org
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

CREATE POLICY "Users can view own org profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );
