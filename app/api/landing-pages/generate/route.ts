/**
 * POST /api/landing-pages/generate
 * Gera HTML completo de uma landing page usando IA.
 */

import { streamText } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { buildLandingPagePrompt, buildRefinementPrompt, isLiteModel } from '@/features/landing-pages/lib/page-generator';

// 300s = 5 min. Vercel Pro permite até 800s. Geração premium de landing
// page completa com modelos lentos (Flash variants) pode passar de 120s.
// Os timeouts em produção estavam matando a geração no meio.
export const maxDuration = 300;

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
  currentHtml: z.string().optional(), // presente em refinamentos iterativos
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function POST(req: Request) {
  try {
    const { model, modelId } = await requireAITaskContext(req);

    const body = await req.json().catch(() => null);
    const parsed = GenerateSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues?.[0] ?? parsed.error;
      return json({ error: (issue as { message?: string }).message ?? 'Payload inválido.' }, 400);
    }

    const { prompt, orgName, webhookUrl, apiKey, formFields, thankYouMessage, thankYouRedirectUrl, currentHtml } = parsed.data;

    // Refinamento iterativo: usuário já tem HTML e quer alterar algo
    const { system, userPrompt } = currentHtml
      ? buildRefinementPrompt(prompt, currentHtml)
      : buildLandingPagePrompt({
          userPrompt: prompt,
          orgName,
          webhookUrl,
          apiKey,
          formFields,
          thankYouMessage,
          thankYouRedirectUrl,
          modelId,
        });

    const useLite = isLiteModel(modelId);
    if (useLite) {
      console.info('[generate] Using LITE prompt for model:', modelId);
    }

    // 16384 cobre todos os providers suportados (gpt-4o teto, Gemini 2.0+, Claude Sonnet 4.5).
    // 8192 era pequeno demais — landing pages premium completas precisam de ~12-15K tokens
    // de output (paleta + tipografia + 10 seções + SVGs inline + motion script + form).
    // Validação anti-truncamento agora roda em 2 lugares (client + PATCH server-side).
    const result = streamText({
      model,
      system,
      maxRetries: 0,
      maxOutputTokens: 16384,
      messages: [{ role: 'user', content: userPrompt }],
      onFinish: ({ finishReason, usage, text }) => {
        // Visibilidade: logar cada geração com finishReason. Se for 'length',
        // significa truncamento por max_tokens. Se for 'stop' mas o texto for
        // muito curto (<2KB), provavelmente o modelo se confundiu com o
        // system prompt grande — sinal pra trocar de modelo.
        const len = text?.length ?? 0;
        const endsClean = /<\/html\s*>\s*$/i.test(text ?? '');
        if (finishReason === 'length' || !endsClean) {
          console.warn('[generate] HTML incompleto', {
            finishReason,
            chars: len,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
            endsClean,
          });
        }
      },
    });

    return result.toTextStreamResponse();
  } catch (err) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      const issue = err.issues?.[0] ?? err;
      return json({ error: (issue as { message?: string }).message ?? 'Payload inválido.' }, 400);
    }
    console.error('[api/landing-pages/generate]', err);
    const message = err instanceof Error ? err.message : 'Erro ao gerar landing page. Tente novamente.';
    return json({ error: message }, 500);
  }
}
