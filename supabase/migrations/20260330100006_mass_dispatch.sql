-- =============================================================================
-- MASS DISPATCH — Disparo em Massa + Mensagens Agendadas
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. MASS_DISPATCHES (campanhas de disparo em massa)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mass_dispatches (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  message_template TEXT        NOT NULL,
  target_filter    JSONB       NOT NULL DEFAULT '{}',  -- {tags: [], stage_ids: [], board_ids: []}
  channel          TEXT        NOT NULL DEFAULT 'whatsapp',
  delay_seconds    INTEGER     NOT NULL DEFAULT 120,
  status           TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','running','completed','cancelled','failed')),
  total_recipients INTEGER     NOT NULL DEFAULT 0,
  sent_count       INTEGER     NOT NULL DEFAULT 0,
  delivered_count  INTEGER     NOT NULL DEFAULT 0,
  failed_count     INTEGER     NOT NULL DEFAULT 0,
  replied_count    INTEGER     NOT NULL DEFAULT 0,
  scheduled_at     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_by       UUID        REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mass_dispatches_org
  ON public.mass_dispatches (organization_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. MASS_DISPATCH_RECIPIENTS (destinatários do disparo)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mass_dispatch_recipients (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id      UUID        NOT NULL REFERENCES public.mass_dispatches(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id       UUID        REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone            TEXT        NOT NULL,
  name             TEXT,
  rendered_message TEXT,       -- mensagem após substituição de variáveis
  status           TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','read','replied','failed','skipped')),
  sent_at          TIMESTAMPTZ,
  error_message    TEXT,
  waha_message_id  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mass_dispatch_recipients_dispatch
  ON public.mass_dispatch_recipients (dispatch_id, status);

CREATE INDEX IF NOT EXISTS idx_mass_dispatch_recipients_org
  ON public.mass_dispatch_recipients (organization_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. SCHEDULED_MESSAGES (mensagens agendadas por conversa/deal)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id  UUID        REFERENCES public.conversations(id) ON DELETE CASCADE,
  deal_id          UUID        REFERENCES public.deals(id) ON DELETE CASCADE,
  contact_id       UUID        REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone            TEXT        NOT NULL,
  body             TEXT        NOT NULL,
  channel          TEXT        NOT NULL DEFAULT 'whatsapp',
  scheduled_at     TIMESTAMPTZ NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled','failed')),
  sent_at          TIMESTAMPTZ,
  error_message    TEXT,
  created_by       UUID        REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_org
  ON public.scheduled_messages (organization_id, scheduled_at, status);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending
  ON public.scheduled_messages (scheduled_at, status)
  WHERE status = 'pending';

-- -----------------------------------------------------------------------------
-- 4. RLS POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.mass_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mass_dispatch_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY mass_dispatches_select ON public.mass_dispatches
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY mass_dispatches_admin ON public.mass_dispatches
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY mass_dispatch_recipients_select ON public.mass_dispatch_recipients
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY mass_dispatch_recipients_service ON public.mass_dispatch_recipients
  FOR ALL WITH CHECK (true);

CREATE POLICY scheduled_messages_select ON public.scheduled_messages
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY scheduled_messages_manage ON public.scheduled_messages
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );
