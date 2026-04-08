/**
 * POST /api/conversations/[id]/assign
 *
 * Atribui a conversa ao usuário autenticado: marca como em_atendimento,
 * desliga o Super Agente para essa conversa (ai_agent_owned = false) e
 * registra o responsável.
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
      assigned_user_id: user.id,
      ai_agent_owned: false,
      status: 'em_atendimento',
    })
    .eq('id', conversationId)
    .eq('organization_id', profile.organization_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
