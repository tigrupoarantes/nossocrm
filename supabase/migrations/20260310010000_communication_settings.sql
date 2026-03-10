-- =============================================================================
-- COMMUNICATION SETTINGS
-- Adiciona configurações de canais de comunicação à tabela organization_settings.
--
-- Colunas adicionadas:
--   smtp_config          — configuração SMTP para envio de e-mails (Nodemailer)
--   twilio_config        — configuração Twilio WhatsApp Business API
--   serasa_config        — credenciais da API SERASA Experian
--   customer_base_config — configuração de acesso à base FLAG/SAP
-- =============================================================================

-- Configuração SMTP por organização
-- { host, port, secure, user, pass, from_name, from_email }
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS smtp_config JSONB;

-- Configuração Twilio WhatsApp
-- { account_sid, auth_token, from_number, messaging_service_sid? }
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS twilio_config JSONB;

-- Configuração SERASA API
-- { client_id, client_secret, base_url, minimum_score }
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS serasa_config JSONB;

-- Configuração base de clientes FLAG/SAP
-- { base_url, api_key, timeout_ms? }
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS customer_base_config JSONB;

-- Comentários de documentação
COMMENT ON COLUMN public.organization_settings.smtp_config IS
  'Configuração SMTP (Nodemailer): { host, port, secure, user, pass, from_name, from_email }';

COMMENT ON COLUMN public.organization_settings.twilio_config IS
  'Configuração Twilio WhatsApp: { account_sid, auth_token, from_number }';

COMMENT ON COLUMN public.organization_settings.serasa_config IS
  'Configuração SERASA API: { client_id, client_secret, base_url, minimum_score }';

COMMENT ON COLUMN public.organization_settings.customer_base_config IS
  'Configuração base FLAG/SAP: { base_url, api_key }';
