-- Captura automatica de leads que chegam via WhatsApp inbound (WAHA / Meta Cloud API).
--
-- Quando uma mensagem chega de um numero desconhecido (sem deal ativo), o webhook
-- cria contato + deal no board/stage configurados aqui e dispara onDealCreated
-- para que as regras de automacao (send_whatsapp, send_email, etc.) rodem.
--
-- Ambas colunas sao nullable: enquanto a organizacao nao configurar, o
-- comportamento anterior (conversa orfa sem deal) e preservado.

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS whatsapp_capture_board_id UUID
    REFERENCES public.boards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS whatsapp_capture_stage_id UUID
    REFERENCES public.board_stages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.organization_settings.whatsapp_capture_board_id IS
  'Board onde leads vindos por WhatsApp inbound sao criados automaticamente. NULL = nao capturar.';

COMMENT ON COLUMN public.organization_settings.whatsapp_capture_stage_id IS
  'Stage (coluna) inicial dos leads capturados via WhatsApp inbound. Deve pertencer ao whatsapp_capture_board_id.';
