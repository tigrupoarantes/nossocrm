-- =============================================================================
-- NOTIFICATION PREFERENCES
-- Preferências de notificação configuráveis por usuário e por evento.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. NOTIFICATION_PREFERENCES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type       TEXT        NOT NULL,
  -- Canais habilitados: 'push', 'email', 'in_app'
  channels         TEXT[]      NOT NULL DEFAULT ARRAY['in_app'],
  is_enabled       BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_notification_pref UNIQUE (user_id, organization_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_user
  ON public.notification_preferences (user_id, organization_id);

-- Evento types esperados:
-- 'new_deal', 'deal_won', 'deal_lost', 'deal_stagnant',
-- 'new_message', 'activity_due', 'activity_overdue',
-- 'agent_event', 'agent_handoff',
-- 'prospecting_complete', 'dispatch_complete',
-- 'new_lead', 'new_submission'

-- -----------------------------------------------------------------------------
-- 2. PUSH_SUBSCRIPTIONS (Web Push)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  endpoint         TEXT        NOT NULL,
  p256dh           TEXT        NOT NULL,
  auth_key         TEXT        NOT NULL,
  user_agent       TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_push_sub_endpoint UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user
  ON public.push_subscriptions (user_id, is_active)
  WHERE is_active = true;

-- -----------------------------------------------------------------------------
-- 3. RLS POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Usuários gerenciam apenas suas próprias preferências
CREATE POLICY notification_prefs_own ON public.notification_preferences
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY push_subs_own ON public.push_subscriptions
  FOR ALL USING (user_id = auth.uid());
