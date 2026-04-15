-- =============================================================================
-- Adiciona coluna CNPJ em crm_companies
-- =============================================================================
-- Motivo: exibir CNPJ da empresa no card do lead (Kanban) e permitir cadastro
-- no CompanyFormModal. Apenas dígitos são armazenados; formatação é feita no UI.
--
-- RLS: a policy existente "Members can manage crm_companies" já cobre
-- SELECT/INSERT/UPDATE em todas as colunas — nenhuma nova policy necessária.
-- =============================================================================

ALTER TABLE public.crm_companies
  ADD COLUMN IF NOT EXISTS cnpj TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_companies_cnpj
  ON public.crm_companies(cnpj)
  WHERE cnpj IS NOT NULL;

COMMENT ON COLUMN public.crm_companies.cnpj IS
  'CNPJ da empresa (14 dígitos, somente números). Validação/formatação no cliente.';
