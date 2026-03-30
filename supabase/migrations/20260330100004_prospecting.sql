-- =============================================================================
-- PROSPECTING — Motor de Prospecção Outbound
-- Busca leads por segmento/cidade, gera listas e controla disparos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PROSPECTING_CAMPAIGNS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prospecting_campaigns (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL DEFAULT '',
  segment          TEXT        NOT NULL,
  city             TEXT,
  filters          JSONB       NOT NULL DEFAULT '{}',
  status           TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'cancelled')),
  total_leads      INTEGER     NOT NULL DEFAULT 0,
  leads_contacted  INTEGER     NOT NULL DEFAULT 0,
  created_by       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospecting_campaigns_org
  ON public.prospecting_campaigns (organization_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. PROSPECTING_LEADS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prospecting_leads (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID        REFERENCES public.prospecting_campaigns(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_name    TEXT,
  phone            TEXT,
  email            TEXT,
  address          TEXT,
  segment          TEXT,
  city             TEXT,
  source           TEXT        DEFAULT 'google_places',
  status           TEXT        NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'responded', 'converted', 'rejected')),
  contact_id       UUID        REFERENCES public.contacts(id) ON DELETE SET NULL,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospecting_leads_campaign
  ON public.prospecting_leads (campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_prospecting_leads_org
  ON public.prospecting_leads (organization_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. PROSPECTING_DISPATCHES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prospecting_dispatches (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID        REFERENCES public.prospecting_campaigns(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id          UUID        REFERENCES public.prospecting_leads(id) ON DELETE CASCADE,
  channel          TEXT        NOT NULL DEFAULT 'whatsapp',
  message_template TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'replied', 'failed')),
  sent_at          TIMESTAMPTZ,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospecting_dispatches_campaign
  ON public.prospecting_dispatches (campaign_id, status);

-- -----------------------------------------------------------------------------
-- 4. RLS POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.prospecting_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospecting_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospecting_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospecting_campaigns_select ON public.prospecting_campaigns
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY prospecting_campaigns_admin ON public.prospecting_campaigns
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY prospecting_leads_select ON public.prospecting_leads
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY prospecting_leads_manage ON public.prospecting_leads
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY prospecting_dispatches_select ON public.prospecting_dispatches
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY prospecting_dispatches_service ON public.prospecting_dispatches
  FOR INSERT WITH CHECK (true);
