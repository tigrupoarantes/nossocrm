'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, ClipboardPaste, Loader2, X } from 'lucide-react';

interface ImportHtmlModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal de import de HTML externo (ex: Lovable). Usuário cola o HTML OU
 * faz upload de arquivo `.html`, informa um título e a LP é criada como
 * draft com o script de captura injetado automaticamente.
 */
export function ImportHtmlModal({ isOpen, onClose }: ImportHtmlModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [html, setHtml] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.html') && file.type !== 'text/html') {
      setError('Envie um arquivo .html');
      return;
    }
    const text = await file.text();
    setHtml(text);
    if (!title) setTitle(file.name.replace(/\.html?$/i, ''));
    setError(null);
  };

  const handleSubmit = async () => {
    setError(null);
    setWarnings([]);

    const trimmedTitle = title.trim();
    const trimmedHtml = html.trim();

    if (!trimmedTitle) {
      setError('Informe um título para a landing page.');
      return;
    }
    if (!trimmedHtml) {
      setError('Cole o HTML ou faça upload de um arquivo .html.');
      return;
    }
    if (!trimmedHtml.includes('</html>')) {
      setError('HTML inválido: não foi encontrado </html>.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/landing-pages/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: trimmedTitle, html: trimmedHtml }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data?.error || 'Falha ao importar HTML.');
        setIsSubmitting(false);
        return;
      }

      if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        setWarnings(data.warnings);
      }

      router.push(`/landing-pages/${data.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display">
              Importar HTML
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Cole o HTML exportado do Lovable (ou outra ferramenta) ou envie um arquivo .html.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white rounded"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              Título
            </label>
            <input
              type="text"
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Ex: Campanha Black Friday"
              value={title}
              onChange={e => setTitle(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-md text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 disabled:opacity-50"
            >
              <Upload size={12} /> Upload .html
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setHtml(text);
                } catch {
                  setError('Não foi possível ler a área de transferência. Cole manualmente.');
                }
              }}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 rounded-md text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 disabled:opacity-50"
            >
              <ClipboardPaste size={12} /> Colar da área de transferência
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,text/html"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
              HTML ({html.length.toLocaleString('pt-BR')} caracteres)
            </label>
            <textarea
              value={html}
              onChange={e => setHtml(e.target.value)}
              placeholder={'<!doctype html>\n<html>...</html>'}
              disabled={isSubmitting}
              className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500 resize-none h-64"
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {warnings.length > 0 && (
            <ul className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
              {warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-5 border-t border-slate-200 dark:border-white/10 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg shadow-sm disabled:opacity-50"
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isSubmitting ? 'Importando...' : 'Importar e editar'}
          </button>
        </div>
      </div>
    </div>
  );
}
