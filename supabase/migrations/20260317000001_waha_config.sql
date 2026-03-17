-- =============================================================================
-- WAHA CONFIG — adiciona coluna waha_config em organization_settings
-- =============================================================================

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS waha_config JSONB;

COMMENT ON COLUMN public.organization_settings.waha_config IS
  'Configuração WAHA: { baseUrl, apiKey, sessionName }. apiKey mascarado no frontend.';
