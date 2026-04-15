/**
 * GET  /api/automation-rules — Lista regras da organização.
 * POST /api/automation-rules — Cria nova regra (admin/owner).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type TriggerType = 'deal_created' | 'stage_entered' | 'days_in_stage' | 'response_received';
type ActionType = 'send_whatsapp' | 'send_email' | 'move_stage' | 'move_to_next_board';

interface RuleInput {
  name: string;
  boardId: string | null;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  actionType: ActionType;
  actionConfig: Record<string, unknown>;
  isActive: boolean;
}

function validateInput(body: unknown): RuleInput | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' };
  const b = body as Record<string, unknown>;
  if (typeof b.name !== 'string' || !b.name.trim()) return { error: 'name é obrigatório' };
  const validTriggers: TriggerType[] = ['deal_created', 'stage_entered', 'days_in_stage', 'response_received'];
  const validActions: ActionType[] = ['send_whatsapp', 'send_email', 'move_stage', 'move_to_next_board'];
  if (!validTriggers.includes(b.triggerType as TriggerType)) return { error: 'triggerType inválido' };
  if (!validActions.includes(b.actionType as ActionType)) return { error: 'actionType inválido' };

  return {
    name: (b.name as string).trim(),
    boardId: (b.boardId as string | null) || null,
    triggerType: b.triggerType as TriggerType,
    triggerConfig: (b.triggerConfig as Record<string, unknown>) || {},
    actionType: b.actionType as ActionType,
    actionConfig: (b.actionConfig as Record<string, unknown>) || {},
    isActive: b.isActive !== false,
  };
}

export async function GET() {
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

  const { data, error } = await supabase
    .from('automation_rules')
    .select('id, name, board_id, trigger_type, trigger_config, action_type, action_config, is_active, position, created_at, updated_at')
    .eq('organization_id', profile.organization_id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

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
  if (!['admin', 'owner', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = validateInput(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await supabase
    .from('automation_rules')
    .insert({
      organization_id: profile.organization_id,
      name: parsed.name,
      board_id: parsed.boardId,
      trigger_type: parsed.triggerType,
      trigger_config: parsed.triggerConfig,
      action_type: parsed.actionType,
      action_config: parsed.actionConfig,
      is_active: parsed.isActive,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
