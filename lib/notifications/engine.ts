import { supabase } from '@/lib/supabase/client';

// ============================================
// NOTIFICATION ENGINE
// ============================================

export type NotificationEventType =
  | 'new_deal'
  | 'deal_won'
  | 'deal_lost'
  | 'deal_stagnant'
  | 'new_message'
  | 'activity_due'
  | 'activity_overdue'
  | 'agent_event'
  | 'agent_handoff'
  | 'prospecting_complete'
  | 'dispatch_complete'
  | 'new_lead'
  | 'new_submission';

export type NotificationChannel = 'push' | 'email' | 'in_app';

export interface NotificationPreference {
  id: string;
  eventType: NotificationEventType;
  channels: NotificationChannel[];
  isEnabled: boolean;
}

export interface NotificationPayload {
  title: string;
  message: string;
  eventType: NotificationEventType;
  data?: Record<string, unknown>;
}

/**
 * Busca preferências de notificação do usuário.
 */
export async function getNotificationPreferences(
  userId: string,
  organizationId: string
): Promise<NotificationPreference[]> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('id, event_type, channels, is_enabled')
    .eq('user_id', userId)
    .eq('organization_id', organizationId);

  if (error || !data) return [];

  return data.map((p) => ({
    id: p.id,
    eventType: p.event_type as NotificationEventType,
    channels: p.channels as NotificationChannel[],
    isEnabled: p.is_enabled,
  }));
}

/**
 * Salva preferência de notificação (upsert).
 */
export async function saveNotificationPreference(
  userId: string,
  organizationId: string,
  eventType: NotificationEventType,
  channels: NotificationChannel[],
  isEnabled: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: userId,
        organization_id: organizationId,
        event_type: eventType,
        channels,
        is_enabled: isEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,organization_id,event_type' }
    );

  return !error;
}

/**
 * Dispara notificação in-app (system_notifications).
 */
export async function sendInAppNotification(
  organizationId: string,
  payload: NotificationPayload
): Promise<boolean> {
  const { error } = await supabase.from('system_notifications').insert({
    organization_id: organizationId,
    title: payload.title,
    message: payload.message,
    type: payload.eventType,
  });

  return !error;
}

/**
 * Busca notificações não lidas.
 */
export async function getUnreadNotifications(
  organizationId: string,
  limit = 20
): Promise<Array<{
  id: string;
  title: string;
  message: string;
  type: string;
  createdAt: string;
}>> {
  const { data, error } = await supabase
    .from('system_notifications')
    .select('id, title, message, type, created_at')
    .eq('organization_id', organizationId)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    createdAt: n.created_at,
  }));
}

/**
 * Marca notificação como lida.
 */
export async function markNotificationRead(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('system_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);

  return !error;
}

/**
 * Marca todas como lidas.
 */
export async function markAllNotificationsRead(organizationId: string): Promise<boolean> {
  const { error } = await supabase
    .from('system_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .is('read_at', null);

  return !error;
}

/**
 * Labels amigáveis para tipos de evento.
 */
export const EVENT_TYPE_LABELS: Record<NotificationEventType, string> = {
  new_deal: 'Nova negociação',
  deal_won: 'Negociação ganha',
  deal_lost: 'Negociação perdida',
  deal_stagnant: 'Negociação parada',
  new_message: 'Nova mensagem',
  activity_due: 'Atividade próxima do vencimento',
  activity_overdue: 'Atividade atrasada',
  agent_event: 'Evento do agente IA',
  agent_handoff: 'Agente transferiu para humano',
  prospecting_complete: 'Prospecção concluída',
  dispatch_complete: 'Disparo concluído',
  new_lead: 'Novo lead capturado',
  new_submission: 'Nova submissão de landing page',
};

/**
 * Defaults de preferências para novos usuários.
 */
export const DEFAULT_PREFERENCES: Array<{
  eventType: NotificationEventType;
  channels: NotificationChannel[];
}> = [
  { eventType: 'new_deal', channels: ['in_app'] },
  { eventType: 'deal_won', channels: ['in_app', 'push'] },
  { eventType: 'deal_lost', channels: ['in_app'] },
  { eventType: 'new_message', channels: ['in_app', 'push'] },
  { eventType: 'activity_due', channels: ['in_app', 'push'] },
  { eventType: 'agent_handoff', channels: ['in_app', 'push'] },
  { eventType: 'new_lead', channels: ['in_app'] },
];
