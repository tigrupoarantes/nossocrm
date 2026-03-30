'use client'

import React from 'react'
import { Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface HourData {
  hour: number
  label: string
  count: number
  isCommercial: boolean
}

const COMMERCIAL_HOURS = new Set([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])

export function HourlyAttendanceChart() {
  const { organizationId } = useAuth()

  const { data: hourData = [], isLoading } = useQuery({
    queryKey: ['hourly-attendance', organizationId],
    queryFn: async (): Promise<HourData[]> => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: conversations } = await supabase
        .from('conversations')
        .select('created_at')
        .eq('organization_id', organizationId!)
        .gte('created_at', thirtyDaysAgo.toISOString())

      // Contabilizar por hora
      const counts = new Array(24).fill(0) as number[]
      for (const conv of (conversations ?? [])) {
        const hour = new Date(conv.created_at).getHours()
        counts[hour]++
      }

      return counts.map((count, hour) => ({
        hour,
        label: `${hour.toString().padStart(2, '0')}h`,
        count,
        isCommercial: COMMERCIAL_HOURS.has(hour),
      }))
    },
    enabled: !!organizationId,
  })

  const total = hourData.reduce((acc, d) => acc + d.count, 0)
  const commercialTotal = hourData.filter((d) => d.isCommercial).reduce((acc, d) => acc + d.count, 0)
  const afterHoursTotal = total - commercialTotal

  if (isLoading) {
    return <div className="h-48 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{total.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-slate-500 mt-1">Total de atendimentos</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/30 rounded-2xl p-4">
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{commercialTotal.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Horário comercial</p>
          <p className="text-xs text-emerald-500 mt-0.5">{total > 0 ? Math.round((commercialTotal / total) * 100) : 0}%</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-4">
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{afterHoursTotal.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Fora do horário</p>
          <p className="text-xs text-blue-500 mt-0.5">{total > 0 ? Math.round((afterHoursTotal / total) * 100) : 0}%</p>
        </div>
      </div>

      {/* Gráfico */}
      <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
        <h4 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-600" />
          Atendimentos por hora do dia (últimos 30 dias)
        </h4>

        {total === 0 ? (
          <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
            Nenhum atendimento registrado ainda.
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hourData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  interval={2}
                />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={(value: number) => [value, 'Atendimentos']}
                  contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f8fafc', fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {hourData.map((entry) => (
                    <Cell
                      key={`cell-${entry.hour}`}
                      fill={entry.isCommercial ? '#10b981' : '#3b82f6'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-emerald-500" />
                Horário comercial (08h–18h)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-blue-500" />
                Fora do horário
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
