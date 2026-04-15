-- =============================================================================
-- Adiciona dados da empresa-do-lead diretamente no contato
-- =============================================================================
-- Motivo: capturar CNPJ, nome fantasia e segmento do PROSPECT via landing page
-- ou cadastro manual. Diferente de crm_companies, que representa as empresas
-- do próprio usuário (Chok/G4/Jarantes). Não criamos crm_company para o lead.
--
-- RLS: policies existentes em contacts já cobrem SELECT/INSERT/UPDATE nas novas
-- colunas — nenhuma policy adicional necessária.
-- =============================================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lead_company_name TEXT,
  ADD COLUMN IF NOT EXISTS lead_company_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS lead_company_industry TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_lead_company_cnpj
  ON public.contacts(lead_company_cnpj)
  WHERE lead_company_cnpj IS NOT NULL;

COMMENT ON COLUMN public.contacts.lead_company_name IS
  'Nome fantasia da empresa do prospect (diferente de crm_companies, que são as empresas do próprio usuário).';
COMMENT ON COLUMN public.contacts.lead_company_cnpj IS
  'CNPJ da empresa do prospect (14 dígitos, somente números).';
COMMENT ON COLUMN public.contacts.lead_company_industry IS
  'Segmento/indústria da empresa do prospect (ex: varejo, indústria, serviços).';
