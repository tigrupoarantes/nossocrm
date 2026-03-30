/**
 * @fileoverview Twilio Inbound Webhook — Response Received
 *
 * Recebe mensagens inbound do WhatsApp via Twilio.
 * Quando um contato responde, busca o deal ativo no board QUALIFICATION
 * pelo número do telefone e dispara onResponseReceived().
 *
 * Também aceita POST JSON manual (para testes e integrações futuras).
 *
 * Twilio envia form-encoded: From=whatsapp%3A%2B5511999990000&Body=Oi
 */

import { NextResponse } from 'next/server';
import { createStaticAdminClient } from '@/lib/supabase/server';
import { onResponseReceived } from '@/lib/automation/triggers';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePhone(raw: string): string {
  // Remove "whatsapp:", "+", spaces, hyphens — keeps digits only
  return raw.replace(/whatsapp:/gi, '').replace(/[^0-9]/g, '');
}

async function findActiveDealByPhone(
  supabase: ReturnType<typeof createStaticAdminClient>,
  phone: string
): Promise<{ dealId: string; boardId: string; organizationId: string } | null> {
  // Busca contatos com este telefone
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, organization_id')
    .or(`phone.ilike.%${phone}%,whatsapp.ilike.%${phone}%`)
    .limit(5);

  if (!contacts || contacts.length === 0) return null;

  // Para cada contato, busca deals ativos em boards com template QUALIFICATION
  for (const contact of contacts) {
    const { data: deals } = await supabase
      .from('deals')
      .select('id, board_id, boards!inner(id, template)')
      .eq('contact_id', contact.id)
      .eq('organization_id', contact.organization_id)
      .is('won_at', null)
      .is('lost_at', null)
      .eq('boards.template', 'QUALIFICATION')
      .limit(1);

    if (deals && deals.length > 0) {
      const deal = deals[0] as any;
      return {
        dealId: deal.id,
        boardId: deal.board_id,
        organizationId: contact.organization_id,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // Validar secret para evitar abuse externo
  const secret = request.headers.get('x-automation-secret');
  const expected = process.env.AUTOMATION_WEBHOOK_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  let fromPhone = '';
  let dealId = '';

  if (contentType.includes('application/x-www-form-urlencoded')) {
    // Twilio inbound webhook (form-encoded)
    const text = await request.text();
    const params = new URLSearchParams(text);
    fromPhone = params.get('From') ?? '';
  } else {
    // Manual / JSON trigger
    const body = await request.json().catch(() => ({}));
    fromPhone = body.from ?? '';
    dealId = body.deal_id ?? '';
  }

  const supabase = createStaticAdminClient();

  // Resolve deal por dealId direto (manual) ou por telefone (Twilio)
  if (dealId) {
    const { data: deal } = await supabase
      .from('deals')
      .select('id, board_id, organization_id')
      .eq('id', dealId)
      .single();

    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    await onResponseReceived({
      dealId: deal.id,
      boardId: deal.board_id,
      organizationId: deal.organization_id,
    });

    return NextResponse.json({ ok: true, dealId: deal.id, source: 'manual' });
  }

  if (!fromPhone) {
    return NextResponse.json({ error: 'Missing from phone' }, { status: 422 });
  }

  const normalized = normalizePhone(fromPhone);
  const match = await findActiveDealByPhone(supabase, normalized);

  if (!match) {
    // Twilio exige 200 mesmo quando não encontramos deal
    return NextResponse.json({ ok: true, matched: false });
  }

  await onResponseReceived(match);

  return NextResponse.json({ ok: true, matched: true, dealId: match.dealId });
}
