-- =============================================================================
-- Permite que qualquer membro da org grave mensagens (outbound send)
-- =============================================================================
-- A policy "Admins can manage messages" (migration 20260317) restringia INSERT
-- a admin/owner, quebrando envio pelo card do lead para role=vendedor:
-- POST /api/messages/send falhava no INSERT com RLS 42501 -> route devolvia 500.
-- A rota ja valida auth + ownership da conversa antes do INSERT; adicionar
-- INSERT/UPDATE para membros e seguro (organization_id e forcado server-side).
-- =============================================================================

DROP POLICY IF EXISTS "Members can insert messages" ON public.messages;
CREATE POLICY "Members can insert messages"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can update messages" ON public.messages;
CREATE POLICY "Members can update messages"
  ON public.messages
  FOR UPDATE
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
