'use client';

import { useRef, useEffect, useState } from 'react';
import { Monitor, Smartphone, Pencil, Eye } from 'lucide-react';

interface LivePreviewProps {
  html: string;
  mode: 'desktop' | 'mobile';
  onModeChange: (mode: 'desktop' | 'mobile') => void;
  isGenerating?: boolean;
  onHtmlEdit?: (html: string) => void;
}

function injectEditorScript(html: string): string {
  const script = `<script>
(function() {
  var banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#4f46e5;color:white;text-align:center;padding:8px 16px;font-size:13px;font-family:sans-serif;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
  banner.textContent = '\\u270f\\ufe0f Modo edi\\u00e7\\u00e3o \\u2014 clique em qualquer texto para editar';
  document.body.prepend(banner);
  document.body.style.paddingTop = '40px';

  var sel = 'h1,h2,h3,h4,h5,h6,p,span,a,li,button,td,th,label,strong,em,blockquote';
  document.querySelectorAll(sel).forEach(function(el) {
    if (el.closest('script,style')) return;
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    el.style.cursor = 'text';
    el.addEventListener('mouseenter', function() { if (document.activeElement !== el) el.style.outline = '2px dashed #6366f1'; });
    el.addEventListener('mouseleave', function() { if (document.activeElement !== el) el.style.outline = ''; });
    el.addEventListener('focus', function() { el.style.outline = '2px solid #6366f1'; el.style.background = 'rgba(99,102,241,0.05)'; });
    el.addEventListener('blur', function() { el.style.outline = ''; el.style.background = ''; });
  });

  document.addEventListener('click', function(e) {
    if (e.target.closest('a')) e.preventDefault();
  });

  var timer;
  document.addEventListener('input', function() {
    clearTimeout(timer);
    timer = setTimeout(function() {
      window.parent.postMessage({ type: 'crm-lp-edit', html: document.documentElement.outerHTML }, '*');
    }, 400);
  });
})();
<\/script>`;
  return html.includes('</body>') ? html.replace('</body>', script + '</body>') : html + script;
}

export function LivePreview({ html, mode, onModeChange, isGenerating = false, onHtmlEdit }: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Atualiza o srcdoc quando o html mudar (fora do modo edição)
  useEffect(() => {
    if (!isEditMode && iframeRef.current) {
      iframeRef.current.srcdoc = html || EMPTY_PREVIEW;
    }
  }, [html, isEditMode]);

  // Ao entrar/sair do modo edição, atualiza o srcdoc
  useEffect(() => {
    if (!iframeRef.current) return;
    if (isEditMode && html) {
      iframeRef.current.srcdoc = injectEditorScript(html);
    } else {
      iframeRef.current.srcdoc = html || EMPTY_PREVIEW;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode]);

  // Escuta mensagens do iframe quando em modo edição
  useEffect(() => {
    if (!isEditMode || !onHtmlEdit) return;
    function handler(e: MessageEvent) {
      if (e.data?.type === 'crm-lp-edit') onHtmlEdit!(e.data.html);
    }
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [isEditMode, onHtmlEdit]);

  const canEdit = !!html && !!onHtmlEdit;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 shrink-0">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {isEditMode ? 'Modo Edição Visual' : 'Preview'}
        </span>
        <div className="flex items-center gap-1">
          {/* Toggle desktop/mobile */}
          {!isEditMode && (
            <>
              <button
                onClick={() => onModeChange('desktop')}
                className={`p-1.5 rounded-lg transition-colors ${mode === 'desktop'
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                title="Desktop"
              >
                <Monitor size={16} />
              </button>
              <button
                onClick={() => onModeChange('mobile')}
                className={`p-1.5 rounded-lg transition-colors ${mode === 'mobile'
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                title="Mobile"
              >
                <Smartphone size={16} />
              </button>
              <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-0.5" />
            </>
          )}

          {/* Botão editor visual / preview */}
          {canEdit && (
            <button
              onClick={() => setIsEditMode(v => !v)}
              className={`p-1.5 rounded-lg transition-colors ${isEditMode
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              title={isEditMode ? 'Ver preview' : 'Editar visualmente'}
            >
              {isEditMode ? <Eye size={16} /> : <Pencil size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Preview iframe (sempre visível — o modo edição injeta script no srcdoc) */}
      <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900 flex items-start justify-center p-4">
        <div
          className={`relative bg-white shadow-xl rounded-lg overflow-hidden transition-all duration-300 ${mode === 'mobile' ? 'w-[390px]' : 'w-full max-w-5xl'
            }`}
          style={{ minHeight: 600 }}
        >
          <iframe
            ref={iframeRef}
            className="w-full"
            style={{ height: 700, border: 'none' }}
            sandbox="allow-scripts allow-forms allow-same-origin"
            title="Preview da Landing Page"
          />
          {isGenerating && (
            <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Gerando HTML com IA...</p>
              <p className="text-xs text-slate-400">Pode levar até 1 minuto</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY_PREVIEW = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
  <div class="text-center text-slate-400 space-y-3 p-8">
    <div class="text-6xl">✨</div>
    <p class="text-lg font-medium text-slate-600">Descreva sua landing page acima</p>
    <p class="text-sm">A IA vai gerar o HTML completo para você.</p>
  </div>
</body>
</html>`;
