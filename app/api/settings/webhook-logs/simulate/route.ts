/**
 * POST /api/settings/webhook-logs/simulate
 *
 * Dispara um POST de teste contra o próprio /api/webhooks/meta-whatsapp
 * com um payload válido da Meta WhatsApp Cloud API. Útil para verificar
 * se a infra da aplicação processa corretamente um inbound, isolando do
 * problema de "será que a Meta está chamando o webhook?".
 *
 * Body opcional: { phone?: string, message?: string }
 *
 * Retorna o status do webhook chamado e o log gerado.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  findAnyMetaConfigForOrg,
  findAnyWahaConfigForOrg,
} from '@/lib/communication/meta-config-resolver';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }
  if (!['admin', 'owner'].includes((profile as Record<string, unknown>).role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    phone?: string;
    message?: string;
    source?: 'meta' | 'waha' | 'auto';
  };

  const phone = (body.phone ?? '5511999999999').replace(/\D/g, '');
  const text = body.message ?? `Mensagem de teste do simulador — ${new Date().toLocaleString('pt-BR')}`;
  const sourceMode = body.source ?? 'auto';

  // Detecta automaticamente qual provider a org usa, ou força um se passado.
  let provider: 'meta' | 'waha' | null = null;

  if (sourceMode === 'meta') provider = 'meta';
  else if (sourceMode === 'waha') provider = 'waha';
  else {
    // auto: tenta meta primeiro, depois WAHA
    const metaCfg = await findAnyMetaConfigForOrg(supabase, profile.organization_id);
    if (metaCfg?.phoneNumberId) {
      provider = 'meta';
    } else {
      const wahaCfg = await findAnyWahaConfigForOrg(supabase, profile.organization_id);
      if (wahaCfg?.sessionName) provider = 'waha';
    }
  }

  if (!provider) {
    return NextResponse.json(
      {
        error: 'Nenhum provider WhatsApp configurado para esta organização',
        hint: 'Configure Meta WhatsApp ou WAHA em Configurações → Comunicação.',
      },
      { status: 422 },
    );
  }

  // ============================================================
  // Simulador META
  // ============================================================
  if (provider === 'meta') {
    const resolved = await findAnyMetaConfigForOrg(supabase, profile.organization_id);
    if (!resolved?.phoneNumberId) {
      return NextResponse.json(
        { error: 'Meta WhatsApp não configurado', hint: 'Vá em Configurações → Comunicação → Meta WhatsApp.' },
        { status: 422 },
      );
    }

    const fakeMessageId = `wamid.SIMULATED_${Date.now()}`;
    const fakePayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'simulated-entry',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: 'simulated',
                  phone_number_id: resolved.phoneNumberId,
                },
                contacts: [{ profile: { name: 'Simulador' }, wa_id: phone }],
                messages: [
                  {
                    from: phone,
                    id: fakeMessageId,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body: text },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const url = new URL('/api/webhooks/meta-whatsapp', request.url);
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fakePayload),
    }).catch((e) => ({ ok: false, status: 0, error: String(e) } as const));

    return NextResponse.json({
      ok: 'status' in res ? res.ok : false,
      webhookStatus: 'status' in res ? res.status : 0,
      provider: 'meta',
      resolvedFrom: resolved.source,
      businessUnitId: resolved.businessUnitId,
      fakeMessageId,
      note: `Meta webhook disparado (phoneNumberId via ${resolved.source}). Veja o novo log abaixo.`,
    });
  }

  // ============================================================
  // Simulador WAHA
  // ============================================================
  const resolved = await findAnyWahaConfigForOrg(supabase, profile.organization_id);
  if (!resolved?.sessionName) {
    return NextResponse.json(
      { error: 'WAHA não configurado', hint: 'Vá em Configurações → Comunicação → WAHA.' },
      { status: 422 },
    );
  }

  const fakeMessageId = `WAHA_SIMULATED_${Date.now()}`;
  const fakePayload = {
    event: 'message',
    session: resolved.sessionName,
    payload: {
      id: fakeMessageId,
      from: `${phone}@c.us`,
      body: text,
      fromMe: false,
      hasMedia: false,
      timestamp: Math.floor(Date.now() / 1000),
    },
  };

  const url = new URL('/api/webhooks/waha', request.url);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.WAHA_WEBHOOK_SECRET ? { 'x-waha-secret': process.env.WAHA_WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify(fakePayload),
  }).catch((e) => ({ ok: false, status: 0, error: String(e) } as const));

  return NextResponse.json({
    ok: 'status' in res ? res.ok : false,
    webhookStatus: 'status' in res ? res.status : 0,
    provider: 'waha',
    resolvedFrom: resolved.source,
    sessionName: resolved.sessionName,
    fakeMessageId,
    note: `WAHA webhook disparado (session=${resolved.sessionName}). Veja o novo log abaixo.`,
  });
}
