-- ============================================================
-- Migration: Landing Pages + Submissions
-- ============================================================

-- Tabela principal de landing pages
CREATE TABLE IF NOT EXISTS landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identificação
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,

  -- Conteúdo
  html_content TEXT NOT NULL DEFAULT '',
  prompt_used TEXT,
  ai_model TEXT,

  -- Configuração de captura
  target_board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  target_stage_id UUID,
  webhook_api_key TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  custom_fields JSONB DEFAULT '[]',
  thank_you_message TEXT DEFAULT 'Obrigado! Entraremos em contato em breve.',
  thank_you_redirect_url TEXT,

  -- SEO
  meta_title TEXT,
  meta_description TEXT,
  og_image_url TEXT,

  -- Tracking
  google_analytics_id TEXT,
  meta_pixel_id TEXT,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,

  -- Métricas (desnormalizadas para performance)
  views_count INTEGER DEFAULT 0,
  submissions_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  UNIQUE (organization_id, slug)
);

-- RLS
ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_can_view_landing_pages"
  ON landing_pages FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "managers_can_manage_landing_pages"
  ON landing_pages FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
  ));

-- Índice para rota pública (busca por slug sem auth)
CREATE INDEX IF NOT EXISTS idx_landing_pages_slug_published
  ON landing_pages(slug)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_landing_pages_org
  ON landing_pages(organization_id, created_at DESC);

-- Trigger updated_at
CREATE TRIGGER set_landing_pages_updated_at
  BEFORE UPDATE ON landing_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Tabela de submissões (leads capturados pela landing page)
-- ============================================================

CREATE TABLE IF NOT EXISTS landing_page_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  landing_page_id UUID NOT NULL REFERENCES landing_pages(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,

  -- Dados do formulário
  form_data JSONB NOT NULL DEFAULT '{}',

  -- Contexto de acesso
  ip_address TEXT,
  user_agent TEXT,
  referrer TEXT,

  -- UTM params
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE landing_page_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_can_view_submissions"
  ON landing_page_submissions FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_lp_submissions_page
  ON landing_page_submissions(landing_page_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lp_submissions_org
  ON landing_page_submissions(organization_id, created_at DESC);

-- Trigger: incrementar submissions_count ao inserir submissão
CREATE OR REPLACE FUNCTION update_landing_page_metrics()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE landing_pages SET
    submissions_count = submissions_count + 1,
    updated_at = NOW()
  WHERE id = NEW.landing_page_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_submission_update_metrics
  AFTER INSERT ON landing_page_submissions
  FOR EACH ROW EXECUTE FUNCTION update_landing_page_metrics();
