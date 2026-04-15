/**
 * @fileoverview Rehospedagem de mídia inbound do WhatsApp (Meta/WAHA).
 *
 * URLs originais do Meta (`lookaside.fbsbx.com`) e WAHA expiram em ~5 min
 * ou dependem de autenticação — se persistirmos no banco a URL original,
 * a imagem/áudio/documento quebra logo depois. Este util baixa o blob e
 * sobe no bucket público `conversation-attachments` (migration
 * `20260415200000_conversation_attachments_bucket.sql`), retornando a URL
 * pública permanente.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type MediaType = 'image' | 'audio' | 'video' | 'document' | 'file';

export interface RehostParams {
  /** URL original da mídia (Meta ou WAHA). */
  sourceUrl: string;
  /** Headers adicionais para autenticar o GET (ex: Bearer do Meta). */
  headers?: Record<string, string>;
  /** Organização dona do arquivo (usada no path). */
  organizationId: string;
  /** Mimetype declarado pelo provedor (opcional — fallback via Content-Type). */
  mimetype?: string;
  /** Nome de arquivo opcional (sem extensão; geramos UUID). */
  filenameHint?: string;
}

export interface RehostResult {
  /** URL pública permanente no bucket. */
  publicUrl: string;
  /** Mimetype final detectado. */
  mimetype: string;
  /** Categoria da mídia inferida do mimetype. */
  mediaType: MediaType;
  /** Tamanho em bytes. */
  size: number;
}

const BUCKET = 'conversation-attachments';

/** Extensão típica por mimetype (inclui defaults comuns do WhatsApp). */
function extensionForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('msword')) return 'doc';
  if (m.includes('officedocument.wordprocessingml')) return 'docx';
  if (m.includes('audio/ogg')) return 'ogg';
  if (m.includes('audio/mpeg')) return 'mp3';
  if (m.includes('audio/mp4')) return 'm4a';
  if (m.includes('audio/webm')) return 'webm';
  if (m.includes('audio/wav')) return 'wav';
  if (m.includes('video/mp4')) return 'mp4';
  if (m.includes('video/webm')) return 'webm';
  return 'bin';
}

/** Classifica o mimetype em uma categoria renderizável pelo MessageBubble. */
export function categorizeMime(mime: string): MediaType {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if (m === 'application/pdf' || m.includes('wordprocessingml') || m.includes('msword')) {
    return 'document';
  }
  return 'file';
}

/**
 * Baixa a mídia da URL fornecida e faz upload no bucket público de anexos.
 * Retorna a URL pública estável + metadados para persistir em `messages`.
 */
export async function rehostInboundMedia(
  supabase: SupabaseClient,
  params: RehostParams
): Promise<RehostResult | null> {
  try {
    const response = await fetch(params.sourceUrl, {
      headers: params.headers ?? {},
    });

    if (!response.ok) {
      console.error('[MediaRehost] fetch falhou', {
        status: response.status,
        url: params.sourceUrl.slice(0, 120),
      });
      return null;
    }

    const buffer = await response.arrayBuffer();
    const size = buffer.byteLength;

    // Content-Type do servidor pode ser mais confiável que o declarado.
    const responseMime = response.headers.get('content-type') || '';
    const mimetype = params.mimetype || responseMime.split(';')[0].trim() || 'application/octet-stream';
    const ext = extensionForMime(mimetype);

    const rawBase = params.filenameHint
      ? params.filenameHint.replace(/[^\w.-]+/g, '-').slice(0, 40)
      : crypto.randomUUID();
    const filename = rawBase.includes('.') ? rawBase : `${rawBase}.${ext}`;
    const path = `${params.organizationId}/${Date.now()}-${filename}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mimetype, upsert: false });

    if (uploadError) {
      console.error('[MediaRehost] upload falhou', {
        error: uploadError.message,
        path,
      });
      return null;
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return {
      publicUrl: urlData.publicUrl,
      mimetype,
      mediaType: categorizeMime(mimetype),
      size,
    };
  } catch (err) {
    console.error('[MediaRehost] erro inesperado', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Helper específico para Meta Cloud API: dado um media.id recebido no
 * webhook, busca a URL temporária via Graph API, baixa e rehospeda.
 */
export async function rehostMetaMedia(
  supabase: SupabaseClient,
  params: {
    mediaId: string;
    accessToken: string;
    organizationId: string;
    mimetype?: string;
    caption?: string;
  }
): Promise<RehostResult | null> {
  // 1. Buscar a URL temporária da mídia via Graph API.
  const urlResp = await fetch(
    `https://graph.facebook.com/v20.0/${params.mediaId}`,
    { headers: { Authorization: `Bearer ${params.accessToken}` } }
  );

  if (!urlResp.ok) {
    console.error('[MediaRehost:Meta] falha ao obter URL da mídia', {
      status: urlResp.status,
      mediaId: params.mediaId,
    });
    return null;
  }

  const meta = (await urlResp.json()) as { url?: string; mime_type?: string };
  if (!meta.url) {
    console.error('[MediaRehost:Meta] resposta sem url', { mediaId: params.mediaId });
    return null;
  }

  return rehostInboundMedia(supabase, {
    sourceUrl: meta.url,
    headers: { Authorization: `Bearer ${params.accessToken}` },
    organizationId: params.organizationId,
    mimetype: params.mimetype ?? meta.mime_type,
    filenameHint: params.mediaId,
  });
}
