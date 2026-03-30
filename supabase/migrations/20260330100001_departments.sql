-- =============================================================================
-- DEPARTMENTS
-- Departamentos para organização de equipes, conversas e agentes.
--
-- Tabelas criadas:
--   departments — departamentos por organização
-- Colunas adicionadas:
--   profiles.department_id — departamento do usuário
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. DEPARTMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  description      TEXT,
  color            TEXT        DEFAULT '#3b82f6',
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_departments_org
  ON public.departments (organization_id);

-- -----------------------------------------------------------------------------
-- 2. ADD department_id TO profiles
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 3. RLS POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY departments_select ON public.departments
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY departments_admin ON public.departments
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
