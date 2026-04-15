-- =============================================================================
-- Bucket para anexos de conversas (imagem, PDF, DOCX, áudio)
-- =============================================================================
-- Usado por:
--   - Upload do atendente (paperclip e mic no MessageInput, limite 5MB client-side).
--   - Rehospedagem de mídia inbound do WhatsApp (Meta/WAHA) que usa URLs
--     temporárias de ~5min. Sem isso, imagem do cliente "quebra" logo após
--     chegar.
--
-- Bucket público para facilitar envio de URL para o WhatsApp (Meta/WAHA
-- baixam da URL). Policies mantêm controle de INSERT/DELETE só para
-- autenticados.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'conversation-attachments',
  'conversation-attachments',
  true,
  5242880,  -- 5 MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/webm',
    'audio/wav',
    'video/mp4'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Usuários autenticados podem subir (org-scoped via path "<orgId>/<uuid>").
DROP POLICY IF EXISTS "Authenticated users can upload conversation attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload conversation attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'conversation-attachments');

-- Service role também precisa inserir (webhooks rodam com service role
-- para rehospedar mídia inbound).
DROP POLICY IF EXISTS "Service role can upload conversation attachments" ON storage.objects;
CREATE POLICY "Service role can upload conversation attachments"
  ON storage.objects FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'conversation-attachments');

-- Leitura pública (bucket é público — Meta/WAHA precisam acessar a URL
-- para baixar e enviar ao destinatário).
DROP POLICY IF EXISTS "Public read conversation attachments" ON storage.objects;
CREATE POLICY "Public read conversation attachments"
  ON storage.objects FOR SELECT TO anon, authenticated, service_role
  USING (bucket_id = 'conversation-attachments');

-- Autenticados podem deletar (ex: cancelar envio antes de mandar).
DROP POLICY IF EXISTS "Authenticated users can delete conversation attachments" ON storage.objects;
CREATE POLICY "Authenticated users can delete conversation attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'conversation-attachments');
