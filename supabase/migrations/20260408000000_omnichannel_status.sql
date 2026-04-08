-- =============================================================================
-- OMNICHANNEL — Status, atribuição humana e handoff do Super Agente
-- =============================================================================
-- Adiciona em public.conversations:
--   status            — em_espera | em_atendimento | encerrado
--   assigned_user_id  — humano responsável (null = sem dono)
--   ai_agent_owned    — true enquanto o Super Agente responde sozinho
--   closed_at         — quando foi encerrada
--   closed_by         — quem encerrou
--
-- Backfill: todas as conversas existentes ficam em_espera e ai_agent_owned=true.
-- Trigger: novo inbound em conversa encerrada reabre para em_espera.
-- =============================================================================

-- 1. Colunas
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS status           TEXT        NOT NULL DEFAULT 'em_espera',
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_agent_owned   BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS closed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. CHECK constraint do status
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_status_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_status_check
  CHECK (status IN ('em_espera', 'em_atendimento', 'encerrado'));

-- 3. Índices para a fila omnichannel
CREATE INDEX IF NOT EXISTS idx_conversations_org_status_last_message
  ON public.conversations (organization_id, status, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_assigned
  ON public.conversations (assigned_user_id, status)
  WHERE assigned_user_id IS NOT NULL;

-- 4. Backfill — garante consistência em conversas pré-existentes
UPDATE public.conversations
   SET status = COALESCE(NULLIF(status, ''), 'em_espera'),
       ai_agent_owned = COALESCE(ai_agent_owned, TRUE)
 WHERE status IS NULL OR status = '';

-- 5. RLS — UPDATE para qualquer membro da mesma org (assumir/encerrar/reabrir)
DROP POLICY IF EXISTS "Members can update conversation status" ON public.conversations;
CREATE POLICY "Members can update conversation status"
  ON public.conversations
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

-- 6. Trigger — novo inbound reabre conversa encerrada
CREATE OR REPLACE FUNCTION public.reopen_conversation_on_inbound()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE public.conversations
       SET status = 'em_espera',
           closed_at = NULL,
           closed_by = NULL
     WHERE id = NEW.conversation_id
       AND status = 'encerrado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_reopen_conversation ON public.messages;
CREATE TRIGGER messages_reopen_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.reopen_conversation_on_inbound();
