-- =============================================================================
-- Multi-BU Channel Settings (PRD 1.1 - Épico B)
-- - business_unit_channel_settings (configuração operacional por canal em cada BU)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.business_unit_channel_settings (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_unit_id UUID NOT NULL REFERENCES public.business_units(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_unit_id, channel),
  CONSTRAINT business_unit_channel_settings_channel_check CHECK (channel IN ('email', 'whatsapp'))
);

CREATE INDEX IF NOT EXISTS idx_bu_channel_settings_org_bu
  ON public.business_unit_channel_settings (organization_id, business_unit_id);

CREATE INDEX IF NOT EXISTS idx_bu_channel_settings_org_channel_active
  ON public.business_unit_channel_settings (organization_id, channel, is_active);

ALTER TABLE public.business_unit_channel_settings ENABLE ROW LEVEL SECURITY;

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

DROP TRIGGER IF EXISTS trg_bu_channel_settings_touch_updated_at ON public.business_unit_channel_settings;
CREATE TRIGGER trg_bu_channel_settings_touch_updated_at
  BEFORE UPDATE ON public.business_unit_channel_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Integrity guards: impedir vínculo cross-tenant
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_bu_channel_settings_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_bu_org UUID;
BEGIN
  SELECT b.organization_id INTO v_bu_org
  FROM public.business_units b
  WHERE b.id = NEW.business_unit_id;

  IF v_bu_org IS NULL THEN
    RAISE EXCEPTION 'Business unit not found';
  END IF;

  IF NEW.organization_id <> v_bu_org THEN
    RAISE EXCEPTION 'Cross-tenant channel setting is not allowed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_bu_channel_settings_org ON public.business_unit_channel_settings;
CREATE TRIGGER trg_validate_bu_channel_settings_org
  BEFORE INSERT OR UPDATE ON public.business_unit_channel_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_bu_channel_settings_org();

-- -----------------------------------------------------------------------------
-- RLS policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can view BU channel settings" ON public.business_unit_channel_settings;
CREATE POLICY "Members can view BU channel settings"
  ON public.business_unit_channel_settings
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id = business_unit_channel_settings.organization_id
    )
  );

DROP POLICY IF EXISTS "Admins can manage BU channel settings" ON public.business_unit_channel_settings;
CREATE POLICY "Admins can manage BU channel settings"
  ON public.business_unit_channel_settings
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id = business_unit_channel_settings.organization_id
        AND p.role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id = business_unit_channel_settings.organization_id
        AND p.role = 'admin'
    )
  );
