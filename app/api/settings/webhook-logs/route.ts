/**
 * GET /api/settings/webhook-logs
 *
 * Retorna os últimos 50 logs de webhooks recebidos pela aplicação.
 * Apenas admins/owners da org. Permite filtrar por source.
 *
 * Query params:
 *   ?source=meta-whatsapp   (opcional)
 *   ?limit=50               (default 50, max 200)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const source = url.searchParams.get('source');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);

  let query = supabase
    .from('webhook_logs')
    .select('id, source, method, status_code, payload, result, error_message, created_at, organization_id')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (source) query = query.eq('source', source);

  // Membros só veem logs da própria org. Logs órfãos (organization_id null,
  // ex.: webhook que caiu antes de resolver org) também são visíveis para
  // diagnosticar problemas de configuração.
  query = query.or(`organization_id.eq.${profile.organization_id},organization_id.is.null`);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}
