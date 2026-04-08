/**
 * POST /api/conversations/[id]/close
 *
 * Encerra a conversa (status = encerrado, closed_at, closed_by).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: conversationId } = await params;

  const { error } = await supabase
    .from('conversations')
    .update({
      status: 'encerrado',
      closed_at: new Date().toISOString(),
      closed_by: user.id,
    })
    .eq('id', conversationId)
    .eq('organization_id', profile.organization_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
