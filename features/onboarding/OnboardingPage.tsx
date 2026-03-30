'use client'

import React from 'react'
import { CheckCircle2, Circle, ChevronRight, Rocket } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'

interface OnboardingStep {
  id: string
  title: string
  description: string
  href: string
  icon: string
  estimatedMinutes: number
}

const STEPS: OnboardingStep[] = [
  {
    id: 'connect_whatsapp',
    title: 'Conectar WhatsApp',
    description: 'Configure sua instância WAHA e conecte o número do WhatsApp Business.',
    href: '/connections',
    icon: '💬',
    estimatedMinutes: 5,
  },
  {
    id: 'create_funnel',
    title: 'Criar seu primeiro funil',
    description: 'Organize seus negócios em estágios para acompanhar o progresso de vendas.',
    href: '/boards',
    icon: '📊',
    estimatedMinutes: 3,
  },
  {
    id: 'add_contact',
    title: 'Adicionar um contato',
    description: 'Cadastre um cliente e explore as informações de contato.',
    href: '/contacts',
    icon: '👤',
    estimatedMinutes: 2,
  },
  {
    id: 'create_deal',
    title: 'Criar um negócio',
    description: 'Abra seu primeiro negócio no pipeline e mova-o pelos estágios.',
    href: '/boards',
    icon: '💼',
    estimatedMinutes: 2,
  },
  {
    id: 'setup_agent',
    title: 'Configurar Agente IA',
    description: 'Crie seu primeiro Super Agente para responder automaticamente no WhatsApp.',
    href: '/super-agent',
    icon: '🤖',
    estimatedMinutes: 5,
  },
  {
    id: 'invite_team',
    title: 'Convidar equipe',
    description: 'Adicione membros da equipe e defina seus papéis.',
    href: '/settings',
    icon: '👥',
    estimatedMinutes: 3,
  },
]

export function OnboardingPage() {
  const { organizationId, user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: progress } = useQuery({
    queryKey: ['onboarding-progress', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('onboarding_progress')
        .select('steps_completed, completed_at, dismissed_at')
        .eq('user_id', user!.id)
        .maybeSingle()

      return data ?? { steps_completed: [] as string[], completed_at: null, dismissed_at: null }
    },
    enabled: !!user?.id,
  })

  const completedSteps = new Set(progress?.steps_completed ?? [])
  const completedCount = completedSteps.size
  const totalSteps = STEPS.length
  const progressPercent = Math.round((completedCount / totalSteps) * 100)

  const toggleMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const current = [...(progress?.steps_completed ?? [])]
      const newSteps = current.includes(stepId)
        ? current.filter((s) => s !== stepId)
        : [...current, stepId]

      const isComplete = newSteps.length === totalSteps

      await supabase.from('onboarding_progress').upsert({
        user_id: user!.id,
        organization_id: organizationId!,
        steps_completed: newSteps,
        completed_at: isComplete ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-progress'] })
    },
  })

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div className="text-center py-4">
          <div className="inline-flex p-3 bg-blue-600 rounded-2xl mb-4">
            <Rocket className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Primeiros Passos
          </h1>
          <p className="text-slate-500">
            Complete as etapas abaixo para aproveitar tudo que o NossoCRM oferece.
          </p>
        </div>

        {/* Barra de progresso */}
        <div className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-slate-900 dark:text-white">
              {completedCount} de {totalSteps} etapas concluídas
            </p>
            <span className="text-lg font-bold text-blue-600">{progressPercent}%</span>
          </div>
          <div className="h-3 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {progressPercent === 100 && (
            <div className="mt-3 flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Parabéns! Você completou todo o onboarding! 🎉
            </div>
          )}
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {STEPS.map((step, idx) => {
            const isCompleted = completedSteps.has(step.id)

            return (
              <div
                key={step.id}
                className={`bg-white dark:bg-white/5 border rounded-2xl p-5 transition-all ${
                  isCompleted
                    ? 'border-emerald-200 dark:border-emerald-500/30 opacity-80'
                    : 'border-slate-200 dark:border-white/10 hover:border-blue-300 dark:hover:border-blue-500/50'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Número/Check */}
                  <button
                    type="button"
                    onClick={() => toggleMutation.mutate(step.id)}
                    className="flex-shrink-0 mt-0.5"
                  >
                    {isCompleted
                      ? <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                      : <Circle className="h-6 w-6 text-slate-300 dark:text-slate-600 hover:text-blue-500 transition-colors" />
                    }
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{step.icon}</span>
                      <h3 className={`font-semibold ${isCompleted ? 'text-slate-500 line-through' : 'text-slate-900 dark:text-white'}`}>
                        {step.title}
                      </h3>
                      <span className="text-xs text-slate-400 ml-auto flex-shrink-0">~{step.estimatedMinutes}min</span>
                    </div>
                    <p className="text-sm text-slate-500">{step.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push(step.href)}
                    className="flex-shrink-0 p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
                    title="Ir para esta seção"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Links de ajuda */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 rounded-2xl p-5">
          <p className="text-sm text-blue-800 dark:text-blue-300 mb-3">
            Precisa de ajuda? Consulte nossa central de artigos.
          </p>
          <button
            type="button"
            onClick={() => router.push('/help')}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            Ir para Central de Ajuda
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
