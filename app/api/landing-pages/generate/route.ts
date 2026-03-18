/**
 * POST /api/landing-pages/generate
 * Gera HTML completo de uma landing page usando IA.
 */

import { generateText } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { buildLandingPagePrompt } from '@/features/landing-pages/lib/page-generator';

export const maxDuration = 120;

const GenerateSchema = z.object({
  prompt: z.string().min(10, 'Descreva sua landing page (mín. 10 caracteres)'),
  orgName: z.string().optional().default('Empresa'),
  webhookUrl: z.string().url('URL do webhook inválida'),
  apiKey: z.string().min(1),
  formFields: z.array(z.object({
    name: z.string(),
    label: z.string(),
    type: z.enum(['text', 'email', 'tel', 'textarea', 'select']),
    required: z.boolean(),
    placeholder: z.string().optional(),
    options: z.array(z.string()).optional(),
  })).optional().default([]),
  thankYouMessage: z.string().optional(),
  thankYouRedirectUrl: z.string().nullable().optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function POST(req: Request) {
  try {
    const { model } = await requireAITaskContext(req);

    const body = await req.json().catch(() => null);
    const parsed = GenerateSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.errors[0].message }, 400);
    }

    const { prompt, orgName, webhookUrl, apiKey, formFields, thankYouMessage, thankYouRedirectUrl } = parsed.data;

    const fullPrompt = buildLandingPagePrompt({
      userPrompt: prompt,
      orgName,
      webhookUrl,
      apiKey,
      formFields,
      thankYouMessage,
      thankYouRedirectUrl,
    });

    const result = await generateText({
      model,
      maxRetries: 2,
      prompt: fullPrompt,
    });

    // Garantir que retornou HTML válido
    const html = result.text.trim();
    if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
      return json({ error: 'A IA não retornou um HTML válido. Tente novamente com uma descrição mais detalhada.' }, 500);
    }

    return json({ html, model: result.response?.modelId ?? 'unknown' });
  } catch (err) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: err.errors[0].message }, 400);
    }
    console.error('[api/landing-pages/generate]', err);
    return json({ error: 'Erro ao gerar landing page. Tente novamente.' }, 500);
  }
}
