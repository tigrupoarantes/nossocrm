-- =============================================================================
-- webhook_logs — diagnóstico de webhooks (Meta WhatsApp, WAHA, Facebook Leads)
-- =============================================================================
-- Tabela append-only que registra TODA chamada recebida pelos endpoints de
-- webhook. Permite inspecionar pela UI (sem precisar de logs Vercel) se a
-- Meta está chamando, qual o payload, e qual o resultado do processamento.
--
-- Não tem RLS público de SELECT — só admins veem (via API que filtra por
-- profile.role).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
  source          TEXT        NOT NULL, -- 'meta-whatsapp' | 'waha' | 'facebook-leads' | etc.
  method          TEXT        NOT NULL DEFAULT 'POST',
  status_code     INTEGER     NOT NULL DEFAULT 200,
  payload         JSONB       NOT NULL DEFAULT '{}',
  result          JSONB       NOT NULL DEFAULT '{}', -- { processed:n, dropped:n, errors:[] }
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_source_created
  ON public.webhook_logs (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_org_created
  ON public.webhook_logs (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Admins lêem os logs da própria org (ou todos quando organization_id é null).
DROP POLICY IF EXISTS "Admins read webhook logs" ON public.webhook_logs;
CREATE POLICY "Admins read webhook logs"
  ON public.webhook_logs
  FOR SELECT
  USING (
    (
      organization_id IS NULL
      OR organization_id IN (
        SELECT organization_id FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'owner')
      )
    )
  );

-- Service role bypassa RLS para INSERT (webhooks usam createStaticAdminClient).
-- Não precisamos de policy de INSERT para anon/authenticated.
