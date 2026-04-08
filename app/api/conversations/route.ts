/**
 * GET /api/conversations
 *
 * Retorna lista paginada de conversas WhatsApp da organização do usuário
 * autenticado, ordenada por last_message_at DESC.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') ?? '0', 10);
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '50', 10), 100);
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const channelFilter = url.searchParams.get('channel');
  const statusFilter = url.searchParams.get('status');
  const assignedTo = url.searchParams.get('assignedTo'); // 'me' | userId | 'unassigned'

  let query = supabase
    .from('conversations')
    .select(
      'id, organization_id, contact_id, deal_id, channel, wa_chat_id, ig_conversation_id, fb_conversation_id, channel_metadata, last_message_at, unread_count, status, assigned_user_id, ai_agent_owned, closed_at, closed_by, created_at, updated_at, contacts(name, phone), deals(title)',
      { count: 'exact' }
    )
    .eq('organization_id', profile.organization_id);

  if (channelFilter) query = query.eq('channel', channelFilter);
  if (statusFilter) query = query.eq('status', statusFilter);
  if (assignedTo === 'me') query = query.eq('assigned_user_id', user.id);
  else if (assignedTo === 'unassigned') query = query.is('assigned_user_id', null);
  else if (assignedTo) query = query.eq('assigned_user_id', assignedTo);

  const { data, error, count } = await query
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Resolve atendente humano (assigned_user_id -> profile) em uma única
  // segunda query. PostgREST não infere o join automático porque a FK aponta
  // para auth.users, não para profiles.
  const rows = data ?? [];
  const assignedIds = Array.from(
    new Set(
      rows
        .map((c) => c.assigned_user_id as string | null)
        .filter((x): x is string => !!x),
    ),
  );

  type AssignedProfile = {
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
    avatar_url: string | null;
  };
  const profilesById: Record<string, AssignedProfile> = {};

  if (assignedIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, nickname, avatar_url')
      .in('id', assignedIds);
    for (const p of profs ?? []) {
      profilesById[p.id as string] = {
        first_name: p.first_name ?? null,
        last_name: p.last_name ?? null,
        nickname: p.nickname ?? null,
        avatar_url: p.avatar_url ?? null,
      };
    }
  }

  const enriched = rows.map((c) => ({
    ...c,
    assigned_user: c.assigned_user_id
      ? profilesById[c.assigned_user_id as string] ?? null
      : null,
  }));

  return NextResponse.json({ data: enriched, totalCount: count ?? 0 });
}
