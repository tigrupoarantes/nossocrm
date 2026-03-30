/**
 * app/api/ads/intelligence/route.ts
 * Análise de IA para campanhas de anúncios.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateText } from 'ai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { campaigns } = await req.json()

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ error: 'No campaigns to analyze' }, { status: 400 })
    }

    // Buscar chave de API
    const { data: orgSettings } = await supabase
      .from('organization_settings')
      .select('ai_provider, ai_api_key')
      .eq('organization_id', profile.organization_id)
      .maybeSingle()

    const apiKey = orgSettings?.ai_api_key ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
    }

    const formatCurrency = (v: number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

    const campaignsSummary = campaigns
      .slice(0, 10)
      .map((c: { name?: string; status?: string; spend?: number; leads?: number; clicks?: number; cpl?: number; ctr?: number }) =>
        `- ${c.name ?? 'Sem nome'}: status=${c.status}, invest=${formatCurrency(c.spend ?? 0)}, leads=${c.leads ?? 0}, clicks=${c.clicks ?? 0}, CPL=${c.cpl ? formatCurrency(c.cpl) : 'N/A'}, CTR=${c.ctr ? `${Number(c.ctr).toFixed(2)}%` : 'N/A'}`
      )
      .join('\n')

    const prompt = `Você é um especialista em marketing digital e anúncios pagos. Analise os dados de campanhas abaixo e forneça insights acionáveis em português brasileiro.

Campanhas:
${campaignsSummary}

Responda APENAS com um JSON válido (sem markdown) no formato:
{
  "summary": "Resumo geral de 2-3 frases sobre a performance das campanhas",
  "topCampaign": "Nome da melhor campanha e por quê",
  "worstCampaign": "Nome da campanha que precisa de atenção e por quê",
  "recommendations": ["Recomendação 1", "Recomendação 2", "Recomendação 3"],
  "alerts": ["Alerta 1 se houver problema crítico"]
}

Se não houver campanha com baixo desempenho, deixe worstCampaign como null.
Se não houver alertas, deixe alerts como array vazio.`

    const google = createGoogleGenerativeAI({ apiKey })
    const { text } = await generateText({
      model: google('gemini-2.0-flash-lite'),
      prompt,
    })

    let result
    try {
      // Remove markdown se presente
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      result = JSON.parse(clean)
    } catch {
      result = {
        summary: text.slice(0, 500),
        topCampaign: null,
        worstCampaign: null,
        recommendations: [],
        alerts: [],
      }
    }

    return NextResponse.json({
      ...result,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[AdsIntelligence]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
