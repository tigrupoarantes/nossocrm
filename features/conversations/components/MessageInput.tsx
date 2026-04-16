'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Paperclip, Mic, X, StopCircle, FileText } from 'lucide-react';
import type { ConversationChannel } from '@/types';
import type { AttachmentMediaType } from '../hooks/useConversationAttachment';
import { validateAttachment, MAX_ATTACHMENT_BYTES } from '../hooks/useConversationAttachment';

export interface MessageSendPayload {
  body: string;
  channel: ConversationChannel;
  mediaUrl?: string;
  mediaType?: AttachmentMediaType;
  filename?: string;
}

export interface AttachmentUploadResult {
  url: string;
  mediaType: AttachmentMediaType;
  filename: string;
}

interface MessageInputProps {
  onSend: (payload: MessageSendPayload) => Promise<void>;
  availableChannels: ConversationChannel[];
  defaultChannel?: ConversationChannel;
  disabled?: boolean;
  isSending?: boolean;
  /**
   * Se fornecido, habilita paperclip (arquivos) e mic (gravação de áudio).
   * O caller é responsável pelo upload (conhece orgId e trata erros).
   */
  uploadAttachment?: (file: File) => Promise<AttachmentUploadResult>;
}

const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  whatsapp: '📱 WhatsApp',
  instagram: '📷 Instagram',
  facebook: '💬 Messenger',
  email: '✉️ E-mail',
};

// MIME list espelha a migration do bucket. Mantém alinhado com useConversationAttachment.
const ACCEPTED_FILE_TYPES =
  'image/jpeg,image/png,image/webp,image/gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,audio/mpeg,audio/mp4,audio/ogg,audio/wav,video/mp4';

interface PendingAttachment {
  file: File;
  previewUrl: string; // object URL para thumbnail/player
  mediaType: AttachmentMediaType;
  filename: string;
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const r = (s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
}

export function MessageInput({
  onSend,
  availableChannels,
  defaultChannel,
  disabled = false,
  isSending = false,
  uploadAttachment,
}: MessageInputProps) {
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<ConversationChannel>(
    defaultChannel ?? availableChannels[0] ?? 'whatsapp'
  );
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Audio recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URL e recorder ao desmontar ou trocar pending
  useEffect(() => {
    return () => {
      if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    };
  }, [pending]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };

  const clearPending = useCallback(() => {
    if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
    setUploadError(null);
  }, [pending]);

  const handleFileSelected = useCallback((file: File) => {
    setUploadError(null);
    const v = validateAttachment(file);
    if (!v.ok) {
      setUploadError(v.error);
      return;
    }
    if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    setPending({
      file,
      previewUrl: URL.createObjectURL(file),
      mediaType: v.mediaType,
      filename: file.name,
    });
  }, [pending]);

  const openFilePicker = () => fileInputRef.current?.click();

  // ---------- Audio recording ----------

  // Cleanup garantido — chamado em finally para evitar isRecording travado
  const cleanupRecording = useCallback(() => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const startRecording = async () => {
    if (!uploadAttachment || isRecording) return;
    setUploadError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // OGG/Opus é o formato nativo do WhatsApp PTT — priorizá-lo evita que o
      // WAHA tenha que transcodificar (e que o WhatsApp do destinatário crashe
      // tentando reproduzir um WebM como voice message). Fallback para webm/mp4
      // só em browsers que não suportam OGG (ex: Safari).
      const mimeCandidates = [
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ];
      const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        try {
          const blobMime = rec.mimeType || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type: blobMime });
          if (blob.size > MAX_ATTACHMENT_BYTES) {
            setUploadError('Áudio acima de 5 MB. Grave mais curto.');
          } else if (blob.size > 0) {
            // Extensão alinhada com MIME — WhatsApp/WAHA usam a extensão como
            // dica para escolher o pipeline de envio (PTT vs anexo).
            const ext = blobMime.includes('ogg')
              ? 'ogg'
              : blobMime.includes('mp4')
              ? 'm4a'
              : 'webm';
            const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blobMime });
            setPending({
              file,
              previewUrl: URL.createObjectURL(file),
              mediaType: 'audio',
              filename: file.name,
            });
          }
        } finally {
          cleanupRecording();
        }
      };
      // onerror garante que isRecording não fica travado se MediaRecorder falhar
      rec.onerror = (e) => {
        console.error('[MessageInput] MediaRecorder error', e);
        setUploadError('Erro durante a gravação.');
        cleanupRecording();
      };
      rec.start();
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error('[MessageInput] startRecording falhou', err);
      setUploadError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Permissão de microfone negada.'
          : 'Não foi possível acessar o microfone.',
      );
      cleanupRecording();
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
        // cleanupRecording será chamado no onstop (finally)
      } else {
        cleanupRecording();
      }
    } catch (err) {
      console.error('[MessageInput] stopRecording falhou', err);
      cleanupRecording();
    }
  };

  const cancelRecording = () => {
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        chunksRef.current = []; // descarta chunks antes do onstop
        recorderRef.current.stop();
      }
    } catch (err) {
      console.error('[MessageInput] cancelRecording falhou', err);
    } finally {
      cleanupRecording();
    }
  };

  // ---------- Send ----------

  const handleSend = async () => {
    const trimmed = body.trim();
    if (isSending || disabled || isUploading) return;
    if (!trimmed && !pending) return;

    let mediaResult: AttachmentUploadResult | undefined;
    if (pending && uploadAttachment) {
      setIsUploading(true);
      try {
        mediaResult = await uploadAttachment(pending.file);
      } catch (err) {
        console.error('[MessageInput] upload do anexo falhou', err);
        setUploadError(err instanceof Error ? err.message : 'Falha ao enviar arquivo.');
        return;
      } finally {
        setIsUploading(false);
      }
    }

    try {
      await onSend({
        body: trimmed,
        channel,
        mediaUrl: mediaResult?.url,
        mediaType: mediaResult?.mediaType,
        filename: mediaResult?.filename,
      });
      setBody('');
      clearPending();
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.focus();
      }
    } catch (err) {
      console.error('[MessageInput] onSend falhou', err);
      setUploadError(err instanceof Error ? err.message : 'Falha ao enviar mensagem.');
    }
  };

  const canSend = (!!body.trim() || !!pending) && !isSending && !disabled && !isUploading && !isRecording;
  const showAttachmentButtons = !!uploadAttachment;

  return (
    <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10 space-y-2">
      {/* Seletor de canal (só aparece se há mais de um canal disponível) */}
      {availableChannels.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Canal:</span>
          <select
            value={channel}
            onChange={e => setChannel(e.target.value as ConversationChannel)}
            className="text-xs bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {availableChannels.map(ch => (
              <option key={ch} value={ch}>
                {CHANNEL_LABELS[ch]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Erro de upload/gravação */}
      {uploadError && (
        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-md px-2 py-1">
          {uploadError}
        </div>
      )}

      {/* Preview do anexo pendente */}
      {pending && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-2">
          {pending.mediaType === 'image' && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={pending.previewUrl}
              alt="Preview"
              className="h-16 w-16 rounded-md object-cover"
            />
          )}
          {pending.mediaType === 'audio' && (
            <audio src={pending.previewUrl} controls className="flex-1 min-w-0" />
          )}
          {pending.mediaType === 'video' && (
            <video src={pending.previewUrl} controls className="h-16 rounded-md" />
          )}
          {pending.mediaType === 'document' && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <FileText size={24} className="shrink-0 text-slate-500" />
              <span className="text-xs truncate text-slate-700 dark:text-slate-300">
                {pending.filename}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={clearPending}
            disabled={isUploading || isSending}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
            aria-label="Remover anexo"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Indicador de gravação */}
      {isRecording && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm text-red-700 dark:text-red-300 font-medium">
              Gravando... {formatSeconds(recordSeconds)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelRecording}
              className="text-xs text-slate-600 dark:text-slate-400 hover:underline"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={stopRecording}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
              aria-label="Parar gravação"
            >
              <StopCircle size={14} /> Parar
            </button>
          </div>
        </div>
      )}

      {/* Input file escondido */}
      {showAttachmentButtons && (
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelected(f);
            e.target.value = ''; // permite reselecionar mesmo arquivo
          }}
        />
      )}

      {/* Row principal: clip + mic + textarea + send */}
      <div className="flex gap-2 items-end">
        {showAttachmentButtons && (
          <>
            <button
              type="button"
              onClick={openFilePicker}
              disabled={disabled || isSending || isUploading || isRecording}
              className="shrink-0 w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Anexar arquivo"
              title="Anexar arquivo (máx 5 MB)"
            >
              <Paperclip size={18} />
            </button>

            {!isRecording && (
              <button
                type="button"
                onClick={startRecording}
                disabled={disabled || isSending || isUploading || !!pending}
                className="shrink-0 w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Gravar áudio"
                title="Gravar áudio"
              >
                <Mic size={18} />
              </button>
            )}
          </>
        )}

        <textarea
          ref={inputRef}
          rows={1}
          value={body}
          onChange={e => setBody(e.target.value)}
          onInput={e => autoGrow(e.currentTarget)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder={pending ? 'Legenda (opcional) — Enter envia' : 'Digite uma mensagem... (Shift+Enter para nova linha)'}
          disabled={disabled || isRecording}
          className="flex-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 resize-none max-h-32 leading-snug"
        />
        <button
          onClick={() => void handleSend()}
          disabled={!canSend}
          className="shrink-0 w-10 h-10 flex items-center justify-center bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Enviar mensagem"
        >
          {isSending || isUploading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
