-- =============================================================================
-- FIX: automation_schedules tinha RLS habilitado mas APENAS policy de SELECT.
-- Como onDealCreated/onStageEntered/onResponseReceived sao chamados client-side
-- (via useMoveDeal etc.) com user token, o INSERT do schedule era bloqueado
-- silenciosamente pela RLS. Resultado: a fila de automacao nunca era populada
-- e nada disparava.
--
-- Aqui adicionamos:
--   - INSERT em automation_schedules para membros da propria org
--   - UPDATE em automation_schedules para membros (cancelar pending, marcar
--     executed pelo engine quando rodar via service role tambem cobre)
--   - INSERT em automation_executions para membros (engine grava resultado;
--     service role bypassa RLS, mas mantemos a policy explicita por seguranca)
-- =============================================================================

-- automation_schedules INSERT
DROP POLICY IF EXISTS "Members can insert automation schedules"
  ON public.automation_schedules;
CREATE POLICY "Members can insert automation schedules"
  ON public.automation_schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- automation_schedules UPDATE (cancelPendingSchedules quando lead responde)
DROP POLICY IF EXISTS "Members can update automation schedules"
  ON public.automation_schedules;
CREATE POLICY "Members can update automation schedules"
  ON public.automation_schedules
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- automation_executions INSERT (engine grava resultado de cada acao)
DROP POLICY IF EXISTS "Members can insert automation executions"
  ON public.automation_executions;
CREATE POLICY "Members can insert automation executions"
  ON public.automation_executions
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );
