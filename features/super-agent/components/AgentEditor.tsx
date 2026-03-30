'use client'

/**
 * AgentEditor — formulário de criação/edição de um Super Agente.
 */
import React, { useState, useEffect } from 'react'
import { ChevronLeft, Save, Loader2, Bot, Brain, Clock, AlertTriangle } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useOptionalToast } from '@/context/ToastContext'

interface Agent {
  id: string
  name: string
  description: string | null
  model: string
  provider: string
  is_active: boolean
  department_id: string | null
}

interface Props {
  agent: Agent | null // null = criação
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  name: string
  description: string
  systemPrompt: string
  model: string
  provider: string
  temperature: number
  maxTokens: number
  scheduleEnabled: boolean
  scheduleStart: number
  scheduleEnd: number
  scheduleDays: number[]
  maxMessagesPerSession: number
  handoffKeywords: string
  fallbackMessage: string
}

const MODELS = [
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Rápido)', provider: 'google' },
  { id: 'gemini-2.5-pro-preview-05-06', label: 'Gemini 2.5 Pro (Avançado)', provider: 'google' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini (Econômico)', provider: 'openai' },
  { id: 'gpt-4o', label: 'GPT-4o (Premium)', provider: 'openai' },
]

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const BUSINESS_DAYS = [1, 2, 3, 4, 5]

export function AgentEditor({ agent, onClose, onSaved }: Props) {
  const { organizationId } = useAuth()
  const { addToast } = useOptionalToast()

  const [form, setForm] = useState<FormState>({
    name: agent?.name ?? '',
    description: agent?.description ?? '',
    systemPrompt: '',
    model: agent?.model ?? 'gemini-3-flash-preview',
    provider: agent?.provider ?? 'google',
    temperature: 0.7,
    maxTokens: 1024,
    scheduleEnabled: false,
    scheduleStart: 8,
    scheduleEnd: 18,
    scheduleDays: BUSINESS_DAYS,
    maxMessagesPerSession: 50,
    handoffKeywords: '',
    fallbackMessage: 'Vou te transferir para nossa equipe. Aguarde um momento! 😊',
  })

  // Carregar dados completos do agente para edição
  useEffect(() => {
    if (!agent?.id) return
    supabase
      .from('super_agents')
      .select('system_prompt, temperature, max_tokens, config')
      .eq('id', agent.id)
      .single()
      .then(({ data }) => {
        if (!data) return
        const config = data.config as Record<string, unknown> ?? {}
        const schedule = config.schedule as Record<string, unknown> | undefined
        const limits = config.limits as Record<string, unknown> | undefined
        const fallback = config.fallback as Record<string, unknown> | undefined

        setForm((f) => ({
          ...f,
          systemPrompt: data.system_prompt ?? '',
          temperature: Number(data.temperature) || 0.7,
          maxTokens: data.max_tokens ?? 1024,
          scheduleEnabled: !!schedule?.enabled,
          scheduleStart: (schedule?.start_hour as number) ?? 8,
          scheduleEnd: (schedule?.end_hour as number) ?? 18,
          scheduleDays: Array.isArray(schedule?.days) ? schedule.days as number[] : BUSINESS_DAYS,
          maxMessagesPerSession: (limits?.max_messages_per_session as number) ?? 50,
          handoffKeywords: Array.isArray(fallback?.handoff_keywords)
            ? (fallback.handoff_keywords as string[]).join(', ')
            : '',
          fallbackMessage: (fallback?.message as string) ?? f.fallbackMessage,
        }))
      })
  }, [agent?.id])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const saveMutation = useMutation({
    mutationFn: async () => {
      const config = {
        schedule: {
          enabled: form.scheduleEnabled,
          start_hour: form.scheduleStart,
          end_hour: form.scheduleEnd,
          days: form.scheduleDays,
        },
        limits: { max_messages_per_session: form.maxMessagesPerSession },
        fallback: {
          message: form.fallbackMessage,
          handoff_keywords: form.handoffKeywords
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
        },
      }

      const payload = {
        organization_id: organizationId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        system_prompt: form.systemPrompt,
        model: form.model,
        provider: form.provider,
        temperature: form.temperature,
        max_tokens: form.maxTokens,
        config,
        updated_at: new Date().toISOString(),
      }

      if (agent?.id) {
        const { error } = await supabase.from('super_agents').update(payload).eq('id', agent.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('super_agents').insert({ ...payload, is_active: false })
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => {
      addToast?.(agent ? 'Agente atualizado!' : 'Agente criado!', 'success')
      onSaved()
    },
    onError: (err: Error) => addToast?.(err.message, 'error'),
  })

  const selectedModel = MODELS.find((m) => m.id === form.model)

  return (
    <div>
      {/* Back + title */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {agent ? `Editar: ${agent.name}` : 'Novo Agente'}
          </h2>
        </div>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Identificação */}
        <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Bot className="h-4 w-4 text-purple-500" /> Identificação
          </h3>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome *</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex: Assistente de Vendas"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descrição</label>
            <input
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Para que serve este agente?"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </section>

        {/* Prompt */}
        <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-500" /> Prompt do Sistema
          </h3>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Instrução para o agente *
            </label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => set('systemPrompt', e.target.value)}
              rows={6}
              placeholder="Você é um assistente de vendas... Seu objetivo é..."
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
            />
            <p className="text-xs text-slate-400 mt-1">
              O agente sempre responde em português. O contexto do contato é adicionado automaticamente.
            </p>
          </div>
          {/* Modelo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Modelo IA</label>
              <select
                value={form.model}
                onChange={(e) => {
                  const m = MODELS.find((x) => x.id === e.target.value)
                  set('model', e.target.value)
                  if (m) set('provider', m.provider)
                }}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Temperatura: {form.temperature}
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={form.temperature}
                onChange={(e) => set('temperature', Number(e.target.value))}
                className="w-full mt-2"
              />
              <p className="text-xs text-slate-400">0 = preciso, 1 = criativo</p>
            </div>
          </div>
        </section>

        {/* Horários */}
        <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-500" /> Horários de Atendimento
            </h3>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={form.scheduleEnabled}
                onChange={(e) => set('scheduleEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600" />
            </label>
          </div>
          {form.scheduleEnabled && (
            <>
              <div className="flex gap-2">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                  const active = form.scheduleDays.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        set('scheduleDays', active
                          ? form.scheduleDays.filter((x) => x !== d)
                          : [...form.scheduleDays, d]
                        )
                      }
                      className={`px-2 py-1 text-xs font-medium rounded-lg transition-colors ${
                        active
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-100 dark:bg-white/10 text-slate-500'
                      }`}
                    >
                      {DAY_LABELS[d]}
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Início</label>
                  <select
                    value={form.scheduleStart}
                    onChange={(e) => set('scheduleStart', Number(e.target.value))}
                    className="px-2 py-1.5 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Fim</label>
                  <select
                    value={form.scheduleEnd}
                    onChange={(e) => set('scheduleEnd', Number(e.target.value))}
                    className="px-2 py-1.5 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Handoff */}
        <section className="bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Transferência para Humano
          </h3>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Palavras-chave de transferência
            </label>
            <input
              value={form.handoffKeywords}
              onChange={(e) => set('handoffKeywords', e.target.value)}
              placeholder="cancelar, reembolso, reclamação, urgente"
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-xs text-slate-400 mt-1">Separadas por vírgula. O agente irá transferir ao detectar essas palavras.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mensagem de transferência</label>
            <input
              value={form.fallbackMessage}
              onChange={(e) => set('fallbackMessage', e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </section>

        {/* Save */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!form.name.trim() || !form.systemPrompt.trim() || saveMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {agent ? 'Salvar alterações' : 'Criar agente'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
