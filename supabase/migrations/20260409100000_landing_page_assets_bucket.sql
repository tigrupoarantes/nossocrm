-- Bucket público para imagens de landing pages.
-- URLs públicas servidas diretamente pelo Supabase Storage CDN.
-- Tamanho máximo: 5 MB. Apenas imagens.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'landing-page-assets',
  'landing-page-assets',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Qualquer pessoa autenticada pode fazer upload (org-scoped via path).
CREATE POLICY "Authenticated users can upload landing page assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'landing-page-assets');

-- Leitura pública (bucket é público, mas policy é obrigatória).
CREATE POLICY "Public read landing page assets"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'landing-page-assets');

-- Apenas autenticados podem deletar seus próprios assets.
CREATE POLICY "Authenticated users can delete landing page assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'landing-page-assets');
