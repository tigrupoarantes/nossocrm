/**
 * POST /api/settings/ai/validate
 * Valida uma API key de IA server-side (sem expor ao browser).
 * Necessário porque Anthropic e OpenAI bloqueiam chamadas diretas do browser por CORS.
 */

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const ValidateSchema = z.object({
  provider: z.enum(['google', 'openai', 'anthropic']),
  apiKey: z.string().min(10),
  model: z.string().min(1),
});

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return json({ error: 'Forbidden' }, 403);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  // Apenas admins podem validar keys
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return json({ error: 'Forbidden' }, 403);
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = ValidateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({ valid: false, error: 'Payload inválido' }, 400);
  }

  const { provider, apiKey, model } = parsed.data;

  try {
    if (provider === 'google') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Hi' }] }],
            generationConfig: { maxOutputTokens: 1 },
          }),
        }
      );

      if (res.ok || res.status === 429) return json({ valid: true });

      const error = await res.json().catch(() => ({}));
      if (res.status === 400 && String(error?.error?.message).includes('API key not valid')) {
        return json({ valid: false, error: 'Chave de API inválida' });
      }
      if (res.status === 403) {
        return json({ valid: false, error: 'Chave sem permissão para este modelo' });
      }
      return json({ valid: false, error: error?.error?.message || 'Erro ao validar chave' });

    } else if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (res.ok) return json({ valid: true });
      if (res.status === 401) return json({ valid: false, error: 'Chave de API inválida' });
      return json({ valid: false, error: 'Erro ao validar chave' });

    } else if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      if (res.ok || res.status === 429) return json({ valid: true });
      if (res.status === 401) return json({ valid: false, error: 'Chave de API inválida' });
      return json({ valid: false, error: 'Erro ao validar chave' });
    }

    return json({ valid: false, error: 'Provedor não suportado' });
  } catch (err) {
    console.error('[api/settings/ai/validate]', err);
    return json({ valid: false, error: 'Erro de conexão ao validar chave.' }, 500);
  }
}
