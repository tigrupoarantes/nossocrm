-- =============================================================================
-- ADS MODULE — Módulo de Anúncios
-- Integração com Facebook/Google Ads para rastreamento de campanhas e leads.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AD_ACCOUNTS (contas de anúncio conectadas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_accounts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform         TEXT        NOT NULL CHECK (platform IN ('facebook', 'google', 'tiktok')),
  account_id       TEXT        NOT NULL,
  account_name     TEXT,
  access_token     TEXT,       -- encrypted at application level
  refresh_token    TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  last_sync_at     TIMESTAMPTZ,
  config           JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ad_account UNIQUE (organization_id, platform, account_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_accounts_org
  ON public.ad_accounts (organization_id, platform);

-- -----------------------------------------------------------------------------
-- 2. AD_CAMPAIGNS (campanhas sincronizadas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ad_account_id    UUID        REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  external_id      TEXT        NOT NULL,
  name             TEXT,
  status           TEXT,
  objective        TEXT,
  budget_daily     NUMERIC,
  budget_lifetime  NUMERIC,
  spend            NUMERIC     NOT NULL DEFAULT 0,
  impressions      INTEGER     NOT NULL DEFAULT 0,
  clicks           INTEGER     NOT NULL DEFAULT 0,
  leads            INTEGER     NOT NULL DEFAULT 0,
  conversions      INTEGER     NOT NULL DEFAULT 0,
  cpl              NUMERIC,    -- cost per lead
  ctr              NUMERIC,    -- click-through rate (%)
  date_start       DATE,
  date_end         DATE,
  synced_at        TIMESTAMPTZ,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  CONSTRAINT uq_ad_campaign UNIQUE (ad_account_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_org
  ON public.ad_campaigns (organization_id, synced_at DESC);

-- -----------------------------------------------------------------------------
-- 3. AD_LEAD_EVENTS (eventos de lead por campanha)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_lead_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id      UUID        REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
  contact_id       UUID        REFERENCES public.contacts(id) ON DELETE SET NULL,
  event_type       TEXT,       -- 'lead', 'purchase', 'view_content', 'add_to_cart'
  event_data       JSONB       NOT NULL DEFAULT '{}',
  source           TEXT        DEFAULT 'capi',  -- 'pixel', 'capi', 'form', 'manual'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_lead_events_org
  ON public.ad_lead_events (organization_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. RLS POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_lead_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY ad_accounts_select ON public.ad_accounts
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY ad_accounts_admin ON public.ad_accounts
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY ad_campaigns_select ON public.ad_campaigns
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY ad_campaigns_service ON public.ad_campaigns
  FOR ALL WITH CHECK (true);

CREATE POLICY ad_lead_events_select ON public.ad_lead_events
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY ad_lead_events_insert ON public.ad_lead_events
  FOR INSERT WITH CHECK (true);
