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
import { findAnyMetaConfigForOrg } from '@/lib/communication/meta-config-resolver';

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

  // Buscar o phoneNumberId configurado da org. Olha em ambos lugares:
  // organization_settings (single-tenant) E business_unit_channel_settings
  // (Multi-BU). Sem isso, orgs Multi-BU sempre falham aqui.
  const resolved = await findAnyMetaConfigForOrg(supabase, profile.organization_id);

  if (!resolved?.phoneNumberId) {
    return NextResponse.json(
      {
        error: 'Meta WhatsApp não configurado para esta organização',
        hint: 'Configure o Phone Number ID em Configurações → Comunicação → Meta WhatsApp OU em uma Business Unit ativa (Configurações → Unidades de Negócio → Canais).',
      },
      { status: 422 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    phone?: string;
    message?: string;
  };

  const phone = (body.phone ?? '5511999999999').replace(/\D/g, '');
  const text = body.message ?? `Mensagem de teste do simulador — ${new Date().toLocaleString('pt-BR')}`;
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

  // Disparar o próprio webhook usando fetch interno (mesma origem)
  const url = new URL('/api/webhooks/meta-whatsapp', request.url);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fakePayload),
  }).catch((e) => ({ ok: false, status: 0, error: String(e) } as const));

  return NextResponse.json({
    ok: 'status' in res ? res.ok : false,
    webhookStatus: 'status' in res ? res.status : 0,
    payloadSent: fakePayload,
    fakeMessageId,
    resolvedFrom: resolved.source,
    businessUnitId: resolved.businessUnitId,
    note: `Webhook disparado usando phoneNumberId resolvido de ${resolved.source}. Veja o novo log abaixo em segundos.`,
  });
}
