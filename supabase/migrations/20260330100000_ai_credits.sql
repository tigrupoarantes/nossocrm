-- =============================================================================
-- AI CREDITS SYSTEM
-- Sistema de créditos para controle de uso de IA no NossoCRM.
--
-- Tabelas criadas:
--   ai_credits              — saldo de créditos por organização
--   ai_credit_transactions  — histórico de transações de créditos
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AI_CREDITS (saldo por organização)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_credits (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance          INTEGER     NOT NULL DEFAULT 0,
  total_used       INTEGER     NOT NULL DEFAULT 0,
  plan_limit       INTEGER     NOT NULL DEFAULT 1500,
  reset_at         TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ai_credits_org UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_credits_org
  ON public.ai_credits (organization_id);

-- -----------------------------------------------------------------------------
-- 2. AI_CREDIT_TRANSACTIONS (histórico)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_credit_transactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL CHECK (type IN ('debit', 'credit', 'refund')),
  amount           INTEGER     NOT NULL,
  description      TEXT,
  reference_type   TEXT,       -- 'super_agent', 'prospecting', 'dispatch', 'ai_chat', 'landing_page'
  reference_id     UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_txns_org
  ON public.ai_credit_transactions (organization_id);

CREATE INDEX IF NOT EXISTS idx_ai_credit_txns_created
  ON public.ai_credit_transactions (organization_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. RLS POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.ai_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_transactions ENABLE ROW LEVEL SECURITY;

-- ai_credits: membros da org podem ler, admins podem gerenciar
CREATE POLICY ai_credits_select ON public.ai_credits
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY ai_credits_admin ON public.ai_credits
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ai_credit_transactions: membros podem ler
CREATE POLICY ai_credit_txns_select ON public.ai_credit_transactions
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- service role pode inserir transações (via API routes)
CREATE POLICY ai_credit_txns_service_insert ON public.ai_credit_transactions
  FOR INSERT WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 4. FUNCTION: deduct_credits (atômica)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_ai_credits(
  p_organization_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Lock row para evitar race condition
  SELECT balance INTO v_balance
  FROM public.ai_credits
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    -- Criar registro com saldo default se não existe
    INSERT INTO public.ai_credits (organization_id, balance, plan_limit)
    VALUES (p_organization_id, 1500, 1500)
    ON CONFLICT (organization_id) DO NOTHING;

    SELECT balance INTO v_balance
    FROM public.ai_credits
    WHERE organization_id = p_organization_id
    FOR UPDATE;
  END IF;

  IF v_balance < p_amount THEN
    RETURN FALSE; -- saldo insuficiente
  END IF;

  -- Debitar
  UPDATE public.ai_credits
  SET balance = balance - p_amount,
      total_used = total_used + p_amount,
      updated_at = now()
  WHERE organization_id = p_organization_id;

  -- Registrar transação
  INSERT INTO public.ai_credit_transactions
    (organization_id, type, amount, description, reference_type, reference_id)
  VALUES
    (p_organization_id, 'debit', p_amount, p_description, p_reference_type, p_reference_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 5. FUNCTION: add_credits
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_ai_credits(
  p_organization_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT 'Créditos adicionados'
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.ai_credits (organization_id, balance, plan_limit)
  VALUES (p_organization_id, p_amount, 1500)
  ON CONFLICT (organization_id)
  DO UPDATE SET
    balance = public.ai_credits.balance + p_amount,
    updated_at = now();

  INSERT INTO public.ai_credit_transactions
    (organization_id, type, amount, description)
  VALUES
    (p_organization_id, 'credit', p_amount, p_description);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
