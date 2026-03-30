'use client'

/**
 * CreditsBadge — badge global mostrando saldo de créditos IA.
 * Aparece no header/sidebar para dar visibilidade ao consumo.
 */
import React from 'react'
import { Zap } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

interface Props {
  className?: string
  /** Se true, mostra só o ícone (para espaços comprimidos) */
  compact?: boolean
}

async function fetchCredits(organizationId: string) {
  const { data } = await supabase
    .from('ai_credits')
    .select('balance, plan_limit')
    .eq('organization_id', organizationId)
    .single()
  return data
}

export function CreditsBadge({ className, compact = false }: Props) {
  const { organizationId } = useAuth()

  const { data } = useQuery({
    queryKey: ['ai-credits', organizationId],
    queryFn: () => fetchCredits(organizationId!),
    enabled: !!organizationId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })

  if (!data) return null

  const percent = data.plan_limit > 0
    ? Math.round((data.balance / data.plan_limit) * 100)
    : 0

  const colorClass =
    percent > 40
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
      : percent > 15
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
      : 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20'

  if (compact) {
    return (
      <span
        title={`${data.balance} créditos restantes`}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border',
          colorClass,
          className
        )}
      >
        <Zap className="h-3 w-3" aria-hidden="true" />
        {data.balance}
      </span>
    )
  }

  return (
    <span
      title={`${data.balance} de ${data.plan_limit} créditos restantes`}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border',
        colorClass,
        className
      )}
    >
      <Zap className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{data.balance.toLocaleString('pt-BR')}</span>
      <span className="opacity-60">/ {data.plan_limit.toLocaleString('pt-BR')}</span>
    </span>
  )
}
