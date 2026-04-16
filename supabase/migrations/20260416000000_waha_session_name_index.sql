-- =============================================================================
-- Performance: índice expressional para lookup multi-tenant de sessionName WAHA
-- =============================================================================
-- Hoje `resolveWahaConfigBySession()` em lib/communication/meta-config-resolver.ts
-- carrega TODAS as `organization_settings` com `waha_config IS NOT NULL` e itera
-- em JavaScript procurando `waha_config.sessionName === sessionName`. Mesmo
-- comportamento na fallback `business_unit_channel_settings`. Isso é
-- O(N orgs) por webhook inbound — em escala, full scan + transferência inútil.
--
-- Esta migration adiciona dois índices B-tree expressionais sobre o campo
-- `sessionName` extraído do JSONB, permitindo que o resolver use:
--
--   .eq('waha_config->>sessionName', sessionName)
--
-- e o Postgres faça lookup O(log N) em vez de full scan.
--
-- Os índices são parciais (`WHERE ... IS NOT NULL`) para não pesar com NULLs.
-- Os campos extraídos são case-sensitive (igual à comparação JS atual).
-- =============================================================================

-- (A) organization_settings.waha_config->>'sessionName'
CREATE INDEX IF NOT EXISTS idx_organization_settings_waha_session_name
  ON organization_settings ((waha_config->>'sessionName'))
  WHERE waha_config IS NOT NULL;

-- (B) business_unit_channel_settings.config->>'sessionName' (apenas para canal whatsapp)
CREATE INDEX IF NOT EXISTS idx_bu_channel_settings_waha_session_name
  ON business_unit_channel_settings ((config->>'sessionName'))
  WHERE channel = 'whatsapp' AND config IS NOT NULL;
