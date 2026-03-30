-- =============================================================================
-- Migration: Harden RLS Policies — Replace USING(true) with org isolation
-- Date: 2026-03-30
-- Author: Security Audit
--
-- Replaces permissive USING(true) policies on core tables with proper
-- organization_id isolation via profiles subquery.
--
-- Pattern used (same as automation_rules, conversations, landing_pages):
--   USING (organization_id IN (
--     SELECT organization_id FROM profiles WHERE id = auth.uid()
--   ))
--
-- NOTE: This migration is SAFE for single-tenant deployments because:
-- 1. All authenticated users already belong to an organization (profile exists)
-- 2. The subquery matches the same org they were already accessing
-- 3. Service role (webhooks, cron, AI) bypasses RLS — not affected
-- =============================================================================

-- Helper: reusable org isolation expression
-- (We inline the subquery in each policy for clarity and compatibility)

-- ---------------------------------------------------------------------------
-- CRM CORE TABLES
-- ---------------------------------------------------------------------------

-- boards (4 permissive policies → 4 org-isolated)
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.boards;
CREATE POLICY "Members can view boards" ON public.boards
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.boards;
CREATE POLICY "Members can create boards" ON public.boards
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.boards;
CREATE POLICY "Members can update boards" ON public.boards
  FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.boards;
CREATE POLICY "Admins can delete boards" ON public.boards
  FOR DELETE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

-- board_stages (4 permissive → 4 org-isolated via boards join)
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.board_stages;
CREATE POLICY "Members can view board_stages" ON public.board_stages
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.board_stages;
CREATE POLICY "Members can create board_stages" ON public.board_stages
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.board_stages;
CREATE POLICY "Members can update board_stages" ON public.board_stages
  FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.board_stages;
CREATE POLICY "Admins can delete board_stages" ON public.board_stages
  FOR DELETE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

-- lifecycle_stages
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.lifecycle_stages;
CREATE POLICY "Members can view lifecycle_stages" ON public.lifecycle_stages
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));
CREATE POLICY "Members can manage lifecycle_stages" ON public.lifecycle_stages
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- crm_companies
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.crm_companies;
CREATE POLICY "Members can manage crm_companies" ON public.crm_companies
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- contacts
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.contacts;
CREATE POLICY "Members can manage contacts" ON public.contacts
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- products
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.products;
CREATE POLICY "Members can manage products" ON public.products
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- deals
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.deals;
CREATE POLICY "Members can manage deals" ON public.deals
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- deal_items
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.deal_items;
CREATE POLICY "Members can manage deal_items" ON public.deal_items
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- activities
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.activities;
CREATE POLICY "Members can manage activities" ON public.activities
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- tags
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.tags;
CREATE POLICY "Members can manage tags" ON public.tags
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- custom_field_definitions
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.custom_field_definitions;
CREATE POLICY "Members can manage custom_field_definitions" ON public.custom_field_definitions
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- leads
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.leads;
CREATE POLICY "Members can manage leads" ON public.leads
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- DEAL ATTACHMENTS (join via deals.organization_id)
-- ---------------------------------------------------------------------------

-- deal_notes (uses deal_id, not direct organization_id)
DROP POLICY IF EXISTS "deal_notes_access" ON public.deal_notes;
CREATE POLICY "Members can manage deal_notes" ON public.deal_notes
  FOR ALL TO authenticated
  USING (
    deal_id IN (
      SELECT d.id FROM public.deals d
      JOIN public.profiles p ON p.organization_id = d.organization_id
      WHERE p.id = auth.uid()
    )
  )
  WITH CHECK (
    deal_id IN (
      SELECT d.id FROM public.deals d
      JOIN public.profiles p ON p.organization_id = d.organization_id
      WHERE p.id = auth.uid()
    )
  );

-- deal_files
DROP POLICY IF EXISTS "deal_files_access" ON public.deal_files;
CREATE POLICY "Members can manage deal_files" ON public.deal_files
  FOR ALL TO authenticated
  USING (
    deal_id IN (
      SELECT d.id FROM public.deals d
      JOIN public.profiles p ON p.organization_id = d.organization_id
      WHERE p.id = auth.uid()
    )
  )
  WITH CHECK (
    deal_id IN (
      SELECT d.id FROM public.deals d
      JOIN public.profiles p ON p.organization_id = d.organization_id
      WHERE p.id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- AI TABLES
-- ---------------------------------------------------------------------------

-- ai_conversations (user-scoped within org)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_conversations;
CREATE POLICY "Users can manage own ai_conversations" ON public.ai_conversations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ai_decisions
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_decisions;
CREATE POLICY "Members can manage ai_decisions" ON public.ai_decisions
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- ai_audio_notes
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_audio_notes;
CREATE POLICY "Members can manage ai_audio_notes" ON public.ai_audio_notes
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- ai_suggestion_interactions
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_suggestion_interactions;
CREATE POLICY "Members can manage ai_suggestion_interactions" ON public.ai_suggestion_interactions
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- SYSTEM / AUDIT TABLES
-- ---------------------------------------------------------------------------

-- system_notifications
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.system_notifications;
CREATE POLICY "Members can view system_notifications" ON public.system_notifications
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));
CREATE POLICY "Admins can manage system_notifications" ON public.system_notifications
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

-- rate_limits (system table — restrict to service role only via restrictive policy)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.rate_limits;
-- rate_limits should only be read/written by service role (no user access needed)
-- With no policy, authenticated users cannot access this table (RLS blocks by default)

-- user_consents (user-scoped)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.user_consents;
CREATE POLICY "Users can manage own consents" ON public.user_consents
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- audit_logs (read-only for admins, write by service role)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.audit_logs;
CREATE POLICY "Admins can view audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

-- security_alerts (read-only for admins)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.security_alerts;
CREATE POLICY "Admins can view security_alerts" ON public.security_alerts
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

-- ---------------------------------------------------------------------------
-- ORGANIZATIONS TABLE (fix weak policy)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated_access" ON public.organizations;
CREATE POLICY "Members can view own organization" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
    AND deleted_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- QUICK SCRIPTS (added for completeness)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.quick_scripts;
CREATE POLICY "Members can manage quick_scripts" ON public.quick_scripts
  FOR ALL TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));
