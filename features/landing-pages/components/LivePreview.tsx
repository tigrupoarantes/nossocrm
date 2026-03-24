'use client';

import React, { useRef, useEffect } from 'react';
import { Monitor, Smartphone } from 'lucide-react';

interface LivePreviewProps {
  html: string;
  mode: 'desktop' | 'mobile';
  onModeChange: (mode: 'desktop' | 'mobile') => void;
  isGenerating?: boolean;
}

export function LivePreview({ html, mode, onModeChange, isGenerating = false }: LivePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Atualiza o srcdoc quando o html mudar
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = html || EMPTY_PREVIEW;
    }
  }, [html]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 shrink-0">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Preview</span>
        <div className="flex items-center gap-1">
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
        </div>
      </div>

      {/* Iframe container */}
      <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900 flex items-start justify-center p-4">
        <div
          className={`relative bg-white shadow-xl rounded-lg overflow-hidden transition-all duration-300 ${mode === 'mobile' ? 'w-[390px]' : 'w-full max-w-5xl'
            }`}
          style={{ minHeight: 600 }}
        >
          <iframe
            ref={iframeRef}
            srcDoc={html || EMPTY_PREVIEW}
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
