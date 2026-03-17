-- =============================================================================
-- WAHA CONVERSATIONS
-- Armazena histórico de conversas e mensagens WhatsApp (via WAHA).
--
-- Tabelas criadas:
--   conversations — threads por contato/deal (wa_chat_id único por org)
--   messages      — mensagens individuais (inbound/outbound)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CONVERSATIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id       UUID        REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id          UUID        REFERENCES public.deals(id) ON DELETE SET NULL,
  -- canal da conversa (extensível no futuro: 'email', 'instagram', etc.)
  channel          TEXT        NOT NULL DEFAULT 'whatsapp',
  -- ID do chat no WAHA, formato: "5511999990000@c.us"
  wa_chat_id       TEXT        NOT NULL,
  last_message_at  TIMESTAMPTZ,
  unread_count     INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, wa_chat_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_org_last_message
  ON public.conversations (organization_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_contact
  ON public.conversations (contact_id);

CREATE INDEX IF NOT EXISTS idx_conversations_deal
  ON public.conversations (deal_id);

-- -----------------------------------------------------------------------------
-- 2. MESSAGES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id  UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  -- ID da mensagem no WAHA (evita duplicatas no webhook)
  wa_message_id    TEXT        NOT NULL,
  -- 'inbound' = recebido do contato | 'outbound' = enviado pelo CRM
  direction        TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body             TEXT        NOT NULL DEFAULT '',
  media_url        TEXT,
  -- 'sent' | 'delivered' | 'read' | 'failed'
  status           TEXT        NOT NULL DEFAULT 'sent',
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, wa_message_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON public.messages (conversation_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_org
  ON public.messages (organization_id);

-- -----------------------------------------------------------------------------
-- 3. RLS — Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages      ENABLE ROW LEVEL SECURITY;

-- conversations: members lêem, admins gerenciam
DROP POLICY IF EXISTS "Members can view conversations" ON public.conversations;
CREATE POLICY "Members can view conversations"
  ON public.conversations
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage conversations" ON public.conversations;
CREATE POLICY "Admins can manage conversations"
  ON public.conversations
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- messages: members lêem, admins gerenciam
DROP POLICY IF EXISTS "Members can view messages" ON public.messages;
CREATE POLICY "Members can view messages"
  ON public.messages
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage messages" ON public.messages;
CREATE POLICY "Admins can manage messages"
  ON public.messages
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- -----------------------------------------------------------------------------
-- 4. TRIGGER: updated_at em conversations
-- A função public.set_updated_at() já foi criada em 20260310000000.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS conversations_set_updated_at ON public.conversations;
CREATE TRIGGER conversations_set_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
