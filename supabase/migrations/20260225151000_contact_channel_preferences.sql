-- =============================================================================
-- Multi-BU Preferences (PRD 1.1)
-- - contact_channel_preferences (opt-in/out por BU + canal)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.contact_channel_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  business_unit_id UUID NOT NULL REFERENCES public.business_units(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  unsubscribed_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contact_channel_preferences_channel_check CHECK (channel IN ('email', 'whatsapp')),
  UNIQUE (contact_id, business_unit_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_contact_channel_preferences_org_contact
  ON public.contact_channel_preferences (organization_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_channel_preferences_org_bu_channel
  ON public.contact_channel_preferences (organization_id, business_unit_id, channel);

ALTER TABLE public.contact_channel_preferences ENABLE ROW LEVEL SECURITY;

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

DROP TRIGGER IF EXISTS trg_contact_channel_preferences_touch_updated_at ON public.contact_channel_preferences;
CREATE TRIGGER trg_contact_channel_preferences_touch_updated_at
  BEFORE UPDATE ON public.contact_channel_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Integrity guards: impedir vínculo cross-tenant
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_contact_channel_preference_org()
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
    RAISE EXCEPTION 'Cross-tenant preference is not allowed';
  END IF;

  IF NEW.opt_in = FALSE AND NEW.unsubscribed_at IS NULL THEN
    NEW.unsubscribed_at := NOW();
  ELSIF NEW.opt_in = TRUE THEN
    NEW.unsubscribed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_contact_channel_preference_org ON public.contact_channel_preferences;
CREATE TRIGGER trg_validate_contact_channel_preference_org
  BEFORE INSERT OR UPDATE ON public.contact_channel_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_contact_channel_preference_org();

-- -----------------------------------------------------------------------------
-- RLS policies
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can manage contact channel preferences" ON public.contact_channel_preferences;
CREATE POLICY "Members can manage contact channel preferences"
  ON public.contact_channel_preferences
  FOR ALL
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id = contact_channel_preferences.organization_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id = contact_channel_preferences.organization_id
    )
  );
