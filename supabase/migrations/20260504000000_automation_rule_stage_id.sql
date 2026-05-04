-- =============================================================================
-- AUTOMATION RULES — STAGE_ID (coluna do board)
--
-- Permite vincular uma regra de automação a uma coluna específica do board.
-- Quando NULL, a regra continua valendo para o board inteiro (compatível com
-- regras já existentes — sem necessidade de migração de dados).
-- =============================================================================

ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS stage_id UUID
    REFERENCES public.board_stages(id) ON DELETE CASCADE;

-- Recria o índice de leitura do engine para incluir stage_id no filtro.
-- O engine consulta: board_id = X AND (stage_id = Y OR stage_id IS NULL)
-- AND is_active = true. O índice abaixo cobre os 3 campos.
DROP INDEX IF EXISTS public.idx_automation_rules_board_active;
CREATE INDEX idx_automation_rules_board_active
  ON public.automation_rules (board_id, stage_id, is_active)
  WHERE is_active = true;

-- RLS: nenhuma alteração — as policies existentes filtram por organization_id
-- e isso continua válido independentemente da nova coluna.
