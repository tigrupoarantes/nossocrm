'use client';

/**
 * Hook de upload de anexos para conversas (imagens, PDFs, DOCX, áudio, vídeo).
 *
 * Sobe o arquivo no bucket público `conversation-attachments` e retorna a URL
 * publica estável + o `mediaType` derivado do MIME para que o caller já saiba
 * qual `message_type` mandar em /api/messages/send.
 *
 * Valida cliente-side: 5MB max + mimetypes permitidos (espelha whitelist da
 * migration `20260415200000_conversation_attachments_bucket.sql`).
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

const BUCKET = 'conversation-attachments';
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export type AttachmentMediaType = 'image' | 'audio' | 'video' | 'document';

const ALLOWED_MIME_TO_TYPE: Record<string, AttachmentMediaType> = {
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'application/pdf': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/msword': 'document',
  'audio/ogg': 'audio',
  'audio/mpeg': 'audio',
  'audio/mp4': 'audio',
  'audio/webm': 'audio',
  'audio/wav': 'audio',
  'video/mp4': 'video',
};

export interface UploadAttachmentParams {
  organizationId: string;
  file: File;
}

export interface UploadAttachmentResult {
  url: string;
  mediaType: AttachmentMediaType;
  filename: string;
  size: number;
  mimetype: string;
}

/**
 * Extrai o MIME base, removendo parâmetros após `;` (ex: `audio/webm;codecs=opus`
 * → `audio/webm`). O `MediaRecorder` anexa o codec, mas o bucket do Supabase
 * e a lista `ALLOWED_MIME_TO_TYPE` só batem com o MIME base.
 */
function baseMimeOf(file: File): string {
  return (file.type || '').split(';')[0].trim().toLowerCase();
}

export function validateAttachment(file: File): { ok: true; mediaType: AttachmentMediaType } | { ok: false; error: string } {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: 'Arquivo acima do limite de 5 MB.' };
  }
  const baseMime = baseMimeOf(file);
  const mediaType = ALLOWED_MIME_TO_TYPE[baseMime];
  if (!mediaType) {
    return { ok: false, error: `Tipo não suportado: ${file.type || 'desconhecido'}.` };
  }
  return { ok: true, mediaType };
}

async function uploadConversationAttachment(
  params: UploadAttachmentParams,
): Promise<UploadAttachmentResult> {
  if (!supabase) {
    throw new Error('Supabase client não configurado');
  }

  const validation = validateAttachment(params.file);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const ext = params.file.name.split('.').pop()?.toLowerCase() || 'bin';
  const baseName = params.file.name.replace(/[^\w.-]+/g, '-').slice(0, 40) || crypto.randomUUID();
  const filenameHasExt = baseName.includes('.');
  const filename = filenameHasExt ? baseName : `${baseName}.${ext}`;
  const path = `${params.organizationId}/${Date.now()}-${crypto.randomUUID()}-${filename}`;

  // Supabase Storage faz match exato com allowed_mime_types do bucket. Se
  // o File vier com `audio/webm;codecs=opus` (padrão do MediaRecorder), o
  // upload é rejeitado silenciosamente. Enviamos sempre o MIME base.
  const baseMime = baseMimeOf(params.file);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, params.file, {
      contentType: baseMime,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return {
    url: data.publicUrl,
    mediaType: validation.mediaType,
    filename,
    size: params.file.size,
    mimetype: baseMime,
  };
}

export function useUploadConversationAttachment() {
  return useMutation({ mutationFn: uploadConversationAttachment });
}
