-- =============================================================================
-- Multi-BU Core (PRD 1.1)
-- - business_units
-- - contact_business_units (N:N contact <-> BU)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.business_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  cnpj TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_business_units_org
  ON public.business_units (organization_id);

CREATE INDEX IF NOT EXISTS idx_business_units_org_active
  ON public.business_units (organization_id, is_active);

ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.contact_business_units (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  business_unit_id UUID NOT NULL REFERENCES public.business_units(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'prospect',
  since_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, business_unit_id),
  CONSTRAINT contact_business_units_relationship_type_check
    CHECK (relationship_type IN ('prospect', 'customer', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_contact_business_units_org_bu
  ON public.contact_business_units (organization_id, business_unit_id);

CREATE INDEX IF NOT EXISTS idx_contact_business_units_org_contact
  ON public.contact_business_units (organization_id, contact_id);

ALTER TABLE public.contact_business_units ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Trigger: updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_units_touch_updated_at ON public.business_units;
CREATE TRIGGER trg_business_units_touch_updated_at
  BEFORE UPDATE ON public.business_units
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_contact_business_units_touch_updated_at ON public.contact_business_units;
CREATE TRIGGER trg_contact_business_units_touch_updated_at
  BEFORE UPDATE ON public.contact_business_units
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Integrity guards: impedir vínculo cross-tenant
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_contact_business_unit_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_org UUID;
  v_bu_org UUID;
BEGIN
  SELECT c.organization_id INTO v_contact_org
  FROM public.contacts c
  WHERE c.id = NEW.contact_id;

  SELECT b.organization_id INTO v_bu_org
  FROM public.business_units b
  WHERE b.id = NEW.business_unit_id;

  IF v_contact_org IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  IF v_bu_org IS NULL THEN
    RAISE EXCEPTION 'Business unit not found';
  END IF;

  IF NEW.organization_id <> v_contact_org OR NEW.organization_id <> v_bu_org THEN
    RAISE EXCEPTION 'Cross-tenant link is not allowed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_contact_business_unit_org ON public.contact_business_units;
CREATE TRIGGER trg_validate_contact_business_unit_org
  BEFORE INSERT OR UPDATE ON public.contact_business_units
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_contact_business_unit_org();

-- -----------------------------------------------------------------------------
-- RLS policies
-- -----------------------------------------------------------------------------

-- business_units: membros podem ler; admins gerenciam.
DROP POLICY IF EXISTS "Members can view business units" ON public.business_units;
CREATE POLICY "Members can view business units"
  ON public.business_units
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id = business_units.organization_id
    )
  );

DROP POLICY IF EXISTS "Admins can manage business units" ON public.business_units;
CREATE POLICY "Admins can manage business units"
  ON public.business_units
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id = business_units.organization_id
        AND p.role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id = business_units.organization_id
        AND p.role = 'admin'
    )
  );

-- contact_business_units: membros da org podem operar (compatível com edição de contatos atual).
DROP POLICY IF EXISTS "Members can manage contact business units" ON public.contact_business_units;
CREATE POLICY "Members can manage contact business units"
  ON public.contact_business_units
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id = contact_business_units.organization_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id = contact_business_units.organization_id
    )
  );
