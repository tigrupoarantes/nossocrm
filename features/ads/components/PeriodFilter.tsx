'use client'

import React from 'react'
import { Calendar } from 'lucide-react'

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last_3d'
  | 'last_7d'
  | 'last_14d'
  | 'last_30d'
  | 'last_90d'
  | 'this_month'
  | 'last_month'

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'last_3d', label: '3 dias' },
  { value: 'last_7d', label: '7 dias' },
  { value: 'last_14d', label: '14 dias' },
  { value: 'last_30d', label: '30 dias' },
  { value: 'last_90d', label: '90 dias' },
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês passado' },
]

interface Props {
  value: DatePreset
  onChange: (preset: DatePreset) => void
}

export function PeriodFilter({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(preset.value)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              value === preset.value
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/20'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  )
}
