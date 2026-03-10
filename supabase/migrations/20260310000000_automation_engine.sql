-- =============================================================================
-- AUTOMATION ENGINE
-- Motor de automação baseado em regras e cadência temporal para o NossoCRM.
--
-- Tabelas criadas:
--   automation_rules      — regras configuráveis por board (trigger + action)
--   automation_schedules  — fila de execuções agendadas por deal
--   automation_executions — histórico de execuções com resultado
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AUTOMATION_RULES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  board_id         UUID        REFERENCES public.boards(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  -- Tipos de trigger:
  -- 'deal_created'     — ao criar um deal no board
  -- 'stage_entered'    — ao entrar em um stage específico (+ days delay)
  -- 'days_in_stage'    — após N dias no stage sem resposta
  -- 'response_received'— quando o contato responde (qualquer canal)
  trigger_type     TEXT        NOT NULL,
  -- { stage_id?: string, days?: number, channel?: string }
  trigger_config   JSONB       NOT NULL DEFAULT '{}',
  -- { field?: string, operator?: string, value?: unknown }
  condition_config JSONB       NOT NULL DEFAULT '{}',
  -- Tipos de action:
  -- 'send_email'          — envia e-mail via SMTP configurado
  -- 'send_whatsapp'       — envia WhatsApp via Twilio
  -- 'move_stage'          — move deal para outro stage (mesmo board)
  -- 'move_to_next_board'  — move deal para board conectado (next_board_id)
  -- 'validate_cnpj'       — valida CNPJ via BrasilAPI (D+0)
  -- 'check_serasa'        — consulta SERASA (D+0)
  -- 'check_customer_base' — verifica base FLAG/SAP (D+0)
  action_type      TEXT        NOT NULL,
  -- { template_id?: string, stage_id?: string, to_stage_label?: string,
  --   minimum_score?: number, cancel_pending?: boolean }
  action_config    JSONB       NOT NULL DEFAULT '{}',
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  position         INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_board_active
  ON public.automation_rules (board_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_automation_rules_org
  ON public.automation_rules (organization_id);

-- -----------------------------------------------------------------------------
-- 2. AUTOMATION_SCHEDULES (fila de execuções agendadas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_schedules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id          UUID        NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  deal_id          UUID        NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  scheduled_at     TIMESTAMPTZ NOT NULL,
  -- 'pending' | 'executed' | 'cancelled' | 'failed'
  status           TEXT        NOT NULL DEFAULT 'pending',
  executed_at      TIMESTAMPTZ,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice crítico de performance: processamento do cron
CREATE INDEX IF NOT EXISTS idx_automation_schedules_pending
  ON public.automation_schedules (scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_automation_schedules_deal
  ON public.automation_schedules (deal_id);

CREATE INDEX IF NOT EXISTS idx_automation_schedules_rule
  ON public.automation_schedules (rule_id);

-- -----------------------------------------------------------------------------
-- 3. AUTOMATION_EXECUTIONS (histórico)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.automation_executions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  schedule_id      UUID        REFERENCES public.automation_schedules(id),
  rule_id          UUID        NOT NULL REFERENCES public.automation_rules(id),
  deal_id          UUID        NOT NULL REFERENCES public.deals(id),
  action_type      TEXT        NOT NULL,
  result           JSONB,
  success          BOOLEAN     NOT NULL,
  executed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_executions_deal
  ON public.automation_executions (deal_id, executed_at DESC);

-- -----------------------------------------------------------------------------
-- 4. RLS — Row Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.automation_rules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_schedules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

-- automation_rules: admin gerencia, member lê
DROP POLICY IF EXISTS "Admins can manage automation rules" ON public.automation_rules;
CREATE POLICY "Admins can manage automation rules"
  ON public.automation_rules
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "Members can view automation rules" ON public.automation_rules;
CREATE POLICY "Members can view automation rules"
  ON public.automation_rules
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- automation_schedules: service role (cron) + member vê os seus
DROP POLICY IF EXISTS "Members can view automation schedules" ON public.automation_schedules;
CREATE POLICY "Members can view automation schedules"
  ON public.automation_schedules
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- automation_executions: member vê histórico da sua org
DROP POLICY IF EXISTS "Members can view automation executions" ON public.automation_executions;
CREATE POLICY "Members can view automation executions"
  ON public.automation_executions
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 5. TRIGGER: atualizar updated_at automaticamente
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS automation_rules_set_updated_at ON public.automation_rules;
CREATE TRIGGER automation_rules_set_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
