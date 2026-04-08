-- =============================================================================
-- Normaliza wa_chat_id legado de @s.whatsapp.net -> @c.us
-- =============================================================================
-- O webhook Meta antigo criava conversas com @s.whatsapp.net, mas o restante
-- do sistema (outbound /api/deals/[id]/conversations e sendAutomationMeta)
-- usa @c.us. Isso causava conversas duplicadas e respostas do lead caindo
-- numa conversa diferente da que o atendente está vendo.
--
-- Esta migration unifica tudo em @c.us. Em caso de colisão (mesma org já tem
-- as duas variantes), prefere manter a @c.us e apaga a @s.whatsapp.net depois
-- de mover suas mensagens para a @c.us.
-- =============================================================================

-- 1) Para cada (org, phone) que tem AMBAS variantes, mover messages da
--    @s.whatsapp.net para a @c.us e apagar a duplicata.
WITH dup AS (
  SELECT
    s.id AS source_id,
    c.id AS target_id
  FROM public.conversations s
  JOIN public.conversations c
    ON c.organization_id = s.organization_id
   AND c.wa_chat_id = REPLACE(s.wa_chat_id, '@s.whatsapp.net', '@c.us')
  WHERE s.wa_chat_id LIKE '%@s.whatsapp.net'
    AND c.wa_chat_id LIKE '%@c.us'
)
UPDATE public.messages m
   SET conversation_id = dup.target_id
  FROM dup
 WHERE m.conversation_id = dup.source_id;

DELETE FROM public.conversations s
 WHERE s.wa_chat_id LIKE '%@s.whatsapp.net'
   AND EXISTS (
     SELECT 1 FROM public.conversations c
      WHERE c.organization_id = s.organization_id
        AND c.wa_chat_id = REPLACE(s.wa_chat_id, '@s.whatsapp.net', '@c.us')
   );

-- 2) Para as restantes (sem duplicata), só renomear o sufixo.
UPDATE public.conversations
   SET wa_chat_id = REPLACE(wa_chat_id, '@s.whatsapp.net', '@c.us')
 WHERE wa_chat_id LIKE '%@s.whatsapp.net';
