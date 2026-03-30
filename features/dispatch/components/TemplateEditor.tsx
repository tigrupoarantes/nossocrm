'use client'

import React from 'react'
import { MessageSquare } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
  preview?: { nome?: string; empresa?: string; telefone?: string }
}

function renderPreview(template: string, vars: { nome?: string; empresa?: string; telefone?: string }) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const map: Record<string, string | undefined> = {
      nome: vars.nome ?? 'João Silva',
      empresa: vars.empresa ?? 'Empresa Exemplo',
      telefone: vars.telefone ?? '11999999999',
    }
    return map[key] ?? match
  })
}

export function TemplateEditor({ value, onChange, preview }: Props) {
  const previewText = renderPreview(value, preview ?? {})

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Mensagem
        </label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          placeholder="Olá {nome}! Tenho uma novidade especial para você..."
          className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />
        <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
          <span>Variáveis:</span>
          {['{nome}', '{empresa}', '{telefone}'].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(value + v)}
              className="px-1.5 py-0.5 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 rounded hover:bg-slate-200 dark:hover:bg-white/20 font-mono"
            >
              {v}
            </button>
          ))}
          <span className="ml-auto">{value.length} caracteres</span>
        </div>
      </div>

      {value && (
        <div className="bg-slate-50 dark:bg-black/20 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />
            Pré-visualização
          </p>
          <div className="bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-3">
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
              {previewText}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
