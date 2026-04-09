'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Monitor, Smartphone, Pencil, Eye } from 'lucide-react';

interface LivePreviewProps {
  html: string;
  mode: 'desktop' | 'mobile';
  onModeChange: (mode: 'desktop' | 'mobile') => void;
  isGenerating?: boolean;
  onHtmlEdit?: (html: string) => void;
  /** Chamado quando o iframe solicita upload de imagem (editor visual) */
  onRequestImageUpload?: () => Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Editor script injetado no iframe (contenteditable + image overlay)
// ---------------------------------------------------------------------------

function injectEditorScript(html: string): string {
  const script = `<script>
(function() {
  // --- Banner discreto ---
  var banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;top:0;right:0;z-index:99999;background:rgba(79,70,229,.9);color:white;padding:6px 16px;font-size:12px;font-family:sans-serif;font-weight:500;border-radius:0 0 0 8px;backdrop-filter:blur(8px);';
  banner.textContent = '\\u270f\\ufe0f Modo edi\\u00e7\\u00e3o';
  document.body.prepend(banner);

  // --- Textos editáveis ---
  var sel = 'h1,h2,h3,h4,h5,h6,p,span,a,li,button,td,th,label,strong,em,blockquote';
  document.querySelectorAll(sel).forEach(function(el) {
    if (el.closest('script,style,nav')) return;
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'false');
    el.style.cursor = 'text';
    el.style.outline = 'none';
    el.style.transition = 'outline .15s, background .15s';
    el.addEventListener('mouseenter', function() { if (document.activeElement !== el) el.style.outline = '2px dashed rgba(99,102,241,.5)'; });
    el.addEventListener('mouseleave', function() { if (document.activeElement !== el) el.style.outline = 'none'; });
    el.addEventListener('focus', function() { el.style.outline = '2px solid #6366f1'; el.style.background = 'rgba(99,102,241,0.06)'; });
    el.addEventListener('blur', function() { el.style.outline = 'none'; el.style.background = ''; });
  });

  // --- Imagens editáveis ---
  document.querySelectorAll('img').forEach(function(img) {
    if (img.closest('script,style')) return;
    var wrapper = img.parentElement;
    if (!wrapper) return;
    if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';

    var overlay = document.createElement('div');
    overlay.setAttribute('data-crm-overlay', 'true');
    overlay.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);opacity:0;transition:opacity .2s;cursor:pointer;z-index:10;border-radius:inherit;';
    overlay.innerHTML = '<div style="background:white;color:#4f46e5;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.2);pointer-events:none;">\\ud83d\\uddbc\\ufe0f Trocar imagem</div>';

    wrapper.addEventListener('mouseenter', function() { overlay.style.opacity = '1'; });
    wrapper.addEventListener('mouseleave', function() { overlay.style.opacity = '0'; });

    overlay.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      // Pede pro parent (builder) abrir file picker real
      window.parent.postMessage({ type: 'crm-lp-request-image', imgSrc: img.src }, '*');
      // Escuta resposta com URL nova
      function onReply(ev) {
        if (ev.data && ev.data.type === 'crm-lp-image-result' && ev.data.url) {
          img.src = ev.data.url;
          notify();
        }
        window.removeEventListener('message', onReply);
      }
      window.addEventListener('message', onReply);
    });

    wrapper.appendChild(overlay);
  });

  // Previne navegação por links
  document.addEventListener('click', function(e) {
    if (e.target.closest('a')) e.preventDefault();
  });

  // --- Notifica parent de mudanças ---
  function notify() {
    clearTimeout(notify._t);
    notify._t = setTimeout(function() {
      // Remove overlays antes de capturar HTML
      document.querySelectorAll('[data-crm-overlay]').forEach(function(o) { o.remove(); });
      window.parent.postMessage({ type: 'crm-lp-edit', html: document.documentElement.outerHTML }, '*');
    }, 300);
  }

  var inputTimer;
  document.addEventListener('input', function() {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(function() {
      window.parent.postMessage({ type: 'crm-lp-edit', html: document.documentElement.outerHTML }, '*');
    }, 300);
  });

  // --- Auto-resize: informa height ao parent ---
  function reportHeight() {
    var h = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'crm-lp-height', height: h }, '*');
  }
  new ResizeObserver(reportHeight).observe(document.body);
  setTimeout(reportHeight, 500);
})();
<\\/script>`;
  return html.includes('</body>') ? html.replace('</body>', script + '</body>') : html + script;
}

// ---------------------------------------------------------------------------
// Auto-resize script injetado no preview (não-edição) para calcular height
// ---------------------------------------------------------------------------

function injectHeightReporter(html: string): string {
  const script = `<script>
(function(){
  function reportHeight(){window.parent.postMessage({type:'crm-lp-height',height:document.documentElement.scrollHeight},'*')}
  new ResizeObserver(reportHeight).observe(document.body);
  setTimeout(reportHeight,300);
})();
<\\/script>`;
  return html.includes('</body>') ? html.replace('</body>', script + '</body>') : html + script;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LivePreview({
  html, mode, onModeChange, isGenerating = false, onHtmlEdit, onRequestImageUpload,
}: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(700);

  // Atualiza o srcdoc quando o html mudar (fora do modo edição)
  useEffect(() => {
    if (!isEditMode && iframeRef.current) {
      iframeRef.current.srcdoc = html
        ? injectHeightReporter(html)
        : EMPTY_PREVIEW;
    }
  }, [html, isEditMode]);

  // Ao entrar/sair do modo edição, atualiza o srcdoc
  useEffect(() => {
    if (!iframeRef.current) return;
    if (isEditMode && html) {
      iframeRef.current.srcdoc = injectEditorScript(html);
    } else {
      iframeRef.current.srcdoc = html
        ? injectHeightReporter(html)
        : EMPTY_PREVIEW;
    }
  }, [isEditMode]); // html is intentionally omitted — only toggle triggers reload

  // Escuta mensagens do iframe
  const handleMessage = useCallback(async (e: MessageEvent) => {
    if (!e.data?.type) return;

    // Edição de conteúdo
    if (e.data.type === 'crm-lp-edit' && isEditMode && onHtmlEdit) {
      onHtmlEdit(e.data.html);
    }

    // Solicitação de upload de imagem via file picker
    if (e.data.type === 'crm-lp-request-image' && onRequestImageUpload) {
      const url = await onRequestImageUpload();
      if (url && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: 'crm-lp-image-result', url },
          '*',
        );
      }
    }

    // Auto-resize do iframe
    if (e.data.type === 'crm-lp-height' && typeof e.data.height === 'number') {
      setIframeHeight(Math.max(400, e.data.height + 20));
    }
  }, [isEditMode, onHtmlEdit, onRequestImageUpload]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const canEdit = !!html && !!onHtmlEdit;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 shrink-0">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {isEditMode ? 'Editando' : 'Preview'}
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
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${isEditMode
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              title={isEditMode ? 'Ver preview' : 'Editar visualmente'}
            >
              {isEditMode ? <><Eye size={14} /> Visualizar</> : <><Pencil size={14} /> Editar</>}
            </button>
          )}
        </div>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900 flex items-start justify-center p-4">
        <div
          className={`relative bg-white shadow-xl rounded-lg overflow-hidden transition-all duration-300 ${mode === 'mobile' ? 'w-[390px]' : 'w-full max-w-5xl'}`}
        >
          <iframe
            ref={iframeRef}
            className="w-full"
            style={{ height: iframeHeight, border: 'none', transition: 'height .3s' }}
            sandbox="allow-scripts allow-forms allow-same-origin"
            title="Preview da Landing Page"
          />
          {isGenerating && (
            <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Gerando com IA...</p>
              <p className="text-xs text-slate-400">Pode levar até 2 minutos</p>
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
  <script src="https://cdn.tailwindcss.com"><\/script>
</head>
<body class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
  <div class="text-center text-slate-400 space-y-3 p-8">
    <div class="text-6xl">✨</div>
    <p class="text-lg font-medium text-slate-600">Descreva sua landing page acima</p>
    <p class="text-sm">A IA vai gerar o HTML completo para você.</p>
  </div>
</body>
</html>`;
