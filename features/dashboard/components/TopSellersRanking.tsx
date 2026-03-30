'use client'

import React from 'react'
import { Trophy, TrendingUp, DollarSign } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

interface SellerStats {
  userId: string
  name: string
  avatarUrl: string | null
  wonDeals: number
  totalRevenue: number
  winRate: number
}

function Avatar({ name, url, size = 8 }: { name: string; url: string | null; size?: number }) {
  const initials = name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500']
  const color = colors[name.charCodeAt(0) % colors.length]

  if (url) {
    return <img src={url} alt={name} className={`w-${size} h-${size} rounded-full object-cover`} />
  }

  return (
    <div className={`w-${size} h-${size} ${color} rounded-full flex items-center justify-center text-white text-xs font-bold`}>
      {initials}
    </div>
  )
}

export function TopSellersRanking() {
  const { organizationId } = useAuth()

  const { data: sellers = [], isLoading } = useQuery({
    queryKey: ['top-sellers', organizationId],
    queryFn: async (): Promise<SellerStats[]> => {
      // Buscar deals ganhos nos últimos 30 dias por usuário
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: deals } = await supabase
        .from('deals')
        .select('assigned_to, value, stage_id')
        .eq('organization_id', organizationId!)
        .not('assigned_to', 'is', null)

      const { data: stages } = await supabase
        .from('stages')
        .select('id, is_won')
        .eq('organization_id', organizationId!)

      const wonStageIds = new Set((stages ?? []).filter((s) => s.is_won).map((s) => s.id))

      // Agrupar por usuário
      const userMap = new Map<string, { wonDeals: number; totalRevenue: number; totalDeals: number }>()

      for (const deal of (deals ?? [])) {
        if (!deal.assigned_to) continue
        const current = userMap.get(deal.assigned_to) ?? { wonDeals: 0, totalRevenue: 0, totalDeals: 0 }
        current.totalDeals++

        if (wonStageIds.has(deal.stage_id)) {
          current.wonDeals++
          current.totalRevenue += Number(deal.value ?? 0)
        }

        userMap.set(deal.assigned_to, current)
      }

      if (userMap.size === 0) return []

      // Buscar perfis
      const userIds = [...userMap.keys()]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', userIds)

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

      const result: SellerStats[] = userIds.map((uid) => {
        const stats = userMap.get(uid)!
        const profile = profileMap.get(uid)
        return {
          userId: uid,
          name: profile?.full_name ?? 'Usuário',
          avatarUrl: profile?.avatar_url ?? null,
          wonDeals: stats.wonDeals,
          totalRevenue: stats.totalRevenue,
          winRate: stats.totalDeals > 0 ? Math.round((stats.wonDeals / stats.totalDeals) * 100) : 0,
        }
      })

      return result.sort((a, b) => b.totalRevenue - a.totalRevenue)
    },
    enabled: !!organizationId,
  })

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

  const MEDALS = ['🥇', '🥈', '🥉']

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 dark:bg-white/5 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  if (sellers.length === 0) {
    return (
      <div className="text-center py-10">
        <Trophy className="h-8 w-8 mx-auto mb-2 text-slate-300" />
        <p className="text-slate-500 text-sm">Nenhum dado de vendedores ainda.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sellers.map((seller, idx) => (
        <div
          key={seller.userId}
          className="flex items-center gap-4 p-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl"
        >
          <div className="flex-shrink-0 w-8 text-center text-lg">
            {idx < 3 ? MEDALS[idx] : <span className="text-slate-400 text-sm font-bold">{idx + 1}</span>}
          </div>
          <Avatar name={seller.name} url={seller.avatarUrl} size={10} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white truncate">{seller.name}</p>
            <p className="text-xs text-slate-500">
              {seller.wonDeals} deal{seller.wonDeals !== 1 ? 's' : ''} ganho{seller.wonDeals !== 1 ? 's' : ''} · Win rate: {seller.winRate}%
            </p>
          </div>
          <div className="text-right">
            <p className="font-bold text-slate-900 dark:text-white text-sm">{formatCurrency(seller.totalRevenue)}</p>
            <div className="flex items-center gap-1 text-xs text-emerald-600 justify-end mt-0.5">
              <TrendingUp className="h-3 w-3" />
              <DollarSign className="h-3 w-3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
