/**
 * Landing Page Assets Service
 * Upload de imagens para landing pages via Supabase Storage (bucket público).
 */
import { supabase } from './client';

const BUCKET = 'landing-page-assets';

/**
 * Faz upload de uma imagem e retorna a URL pública.
 * Path: {orgId}/{lpId}/{uuid}.{ext}
 */
export async function uploadLandingPageImage(
  orgId: string,
  lpId: string,
  file: File,
): Promise<{ url: string | null; error: Error | null }> {
  if (!supabase) {
    return { url: null, error: new Error('Supabase não configurado') };
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${orgId}/${lpId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return { url: null, error: uploadError };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

/**
 * Remove uma imagem do bucket pelo path completo.
 */
export async function deleteLandingPageImage(
  path: string,
): Promise<{ error: Error | null }> {
  if (!supabase) {
    return { error: new Error('Supabase não configurado') };
  }
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return { error };
}
