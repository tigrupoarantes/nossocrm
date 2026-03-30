-- =============================================================================
-- SUPER AGENTS
-- Agentes de IA customizáveis que atendem leads via WhatsApp 24/7.
--
-- Tabelas criadas:
--   super_agents       — agentes configurados por organização
--   super_agent_models — templates/modelos de agente pré-configurados
--   super_agent_logs   — logs de atendimento (input, output, status)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. SUPER_AGENTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.super_agents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  description      TEXT,
  system_prompt    TEXT        NOT NULL DEFAULT '',
  model            TEXT        NOT NULL DEFAULT 'gemini-3-flash-preview',
  provider         TEXT        NOT NULL DEFAULT 'google',
  temperature      NUMERIC     NOT NULL DEFAULT 0.7,
  max_tokens       INTEGER     NOT NULL DEFAULT 1024,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  department_id    UUID        REFERENCES public.departments(id) ON DELETE SET NULL,
  -- config JSONB: { schedule: { enabled, days, start_hour, end_hour },
  --                limits: { max_messages_per_session, max_sessions_per_day },
  --                fallback: { message, handoff_keywords[] } }
  config           JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_super_agents_org
  ON public.super_agents (organization_id, is_active);

-- -----------------------------------------------------------------------------
-- 2. SUPER_AGENT_MODELS (templates globais e por org)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.super_agent_models (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  description      TEXT,
  category         TEXT,  -- 'vendas', 'suporte', 'agendamento', 'qualificacao'
  base_prompt      TEXT        NOT NULL,
  is_template      BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_super_agent_models_org
  ON public.super_agent_models (organization_id);

CREATE INDEX IF NOT EXISTS idx_super_agent_models_templates
  ON public.super_agent_models (is_template)
  WHERE is_template = true;

-- -----------------------------------------------------------------------------
-- 3. SUPER_AGENT_LOGS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.super_agent_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID        REFERENCES public.super_agents(id) ON DELETE SET NULL,
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id  UUID        REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id       UUID        REFERENCES public.contacts(id) ON DELETE SET NULL,
  input_message    TEXT,
  output_message   TEXT,
  tokens_used      INTEGER,
  credits_used     INTEGER     NOT NULL DEFAULT 0,
  response_time_ms INTEGER,
  status           TEXT        NOT NULL CHECK (status IN ('success', 'error', 'fallback', 'handoff', 'skipped')),
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_super_agent_logs_org
  ON public.super_agent_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_super_agent_logs_agent
  ON public.super_agent_logs (agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_super_agent_logs_contact
  ON public.super_agent_logs (contact_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. RLS POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.super_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_agent_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_agent_logs ENABLE ROW LEVEL SECURITY;

-- super_agents: membros podem ler, admins gerenciam
CREATE POLICY super_agents_select ON public.super_agents
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY super_agents_admin ON public.super_agents
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- super_agent_models: templates globais visíveis para todos, orgânicos para membros
CREATE POLICY super_agent_models_select ON public.super_agent_models
  FOR SELECT USING (
    is_template = true
    OR organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY super_agent_models_admin ON public.super_agent_models
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- super_agent_logs: membros podem ler
CREATE POLICY super_agent_logs_select ON public.super_agent_logs
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- service role pode inserir logs
CREATE POLICY super_agent_logs_insert ON public.super_agent_logs
  FOR INSERT WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 5. SEED: Templates globais de agente
-- -----------------------------------------------------------------------------
INSERT INTO public.super_agent_models (name, description, category, base_prompt, is_template)
VALUES
  (
    'Assistente de Vendas',
    'Qualifica leads, apresenta produtos e agenda reuniões',
    'vendas',
    'Você é um assistente de vendas simpático e profissional. Seu objetivo é qualificar o lead, entender sua necessidade e agendar uma reunião com o time comercial. Seja objetivo, amigável e evite pressionar. Quando o lead estiver pronto para avançar, peça confirmação de horário para reunião.',
    true
  ),
  (
    'Suporte ao Cliente',
    'Responde dúvidas, resolve problemas e escala quando necessário',
    'suporte',
    'Você é um agente de suporte ao cliente eficiente e empático. Resolva as dúvidas do cliente de forma clara e objetiva. Se não souber a resposta, seja honesto e ofereça transferir para um humano. Priorize a satisfação do cliente.',
    true
  ),
  (
    'Agendamento',
    'Agenda e confirma compromissos com o cliente',
    'agendamento',
    'Você é um assistente de agendamento. Ajude o cliente a marcar, remarcar ou cancelar consultas/reuniões. Confirme disponibilidade, capture as informações necessárias e confirme o agendamento de forma clara.',
    true
  ),
  (
    'Qualificação de Lead',
    'Coleta informações e pontua o lead antes de passar para vendas',
    'qualificacao',
    'Você é um agente de qualificação de leads. Colete as informações essenciais: nome, empresa, cargo, necessidade principal e urgência. Seja conversacional e natural. Após coletar as informações, informe que o time comercial entrará em contato.',
    true
  )
ON CONFLICT DO NOTHING;
