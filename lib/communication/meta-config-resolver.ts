/**
 * Resolve a configuração Meta WhatsApp Cloud API de uma organização a
 * partir do phone_number_id que a Meta envia no webhook.
 *
 * O NossoCRM tem DOIS lugares onde a config pode estar:
 *
 *   (A) organization_settings.meta_whatsapp_config (single-tenant clássico)
 *   (B) business_unit_channel_settings (multi-BU — quando a org tem várias
 *       unidades de negócio, cada uma com seu próprio número Meta)
 *
 * Esta função olha em AMBOS, retornando a primeira config encontrada cujo
 * phoneNumberId bate com o que a Meta enviou. Sem isso, o webhook inbound
 * dropa mensagens de orgs Multi-BU e o simulador retorna erro mesmo
 * quando o outbound funciona normalmente.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ResolvedMetaConfig {
  organizationId: string
  businessUnitId: string | null
  phoneNumberId: string
  accessToken?: string
  source: 'organization_settings' | 'business_unit_channel_settings'
}

/**
 * Procura a config Meta WhatsApp pelo phoneNumberId. Retorna null se não
 * encontrar em nenhum dos dois lugares.
 */
export async function resolveMetaConfigByPhoneNumberId(
  supabase: SupabaseClient,
  phoneNumberId: string | null | undefined,
): Promise<ResolvedMetaConfig | null> {
  if (!phoneNumberId) return null

  // (A) Procurar em organization_settings.meta_whatsapp_config
  const { data: orgSettings } = await supabase
    .from('organization_settings')
    .select('organization_id, meta_whatsapp_config')
    .not('meta_whatsapp_config', 'is', null)

  for (const row of (orgSettings ?? []) as Array<Record<string, unknown>>) {
    const cfg = row.meta_whatsapp_config as
      | { phoneNumberId?: string; accessToken?: string }
      | null
    if (cfg?.phoneNumberId === phoneNumberId) {
      return {
        organizationId: row.organization_id as string,
        businessUnitId: null,
        phoneNumberId,
        accessToken: cfg.accessToken,
        source: 'organization_settings',
      }
    }
  }

  // (B) Procurar em business_unit_channel_settings (channel='whatsapp')
  const { data: buSettings } = await supabase
    .from('business_unit_channel_settings')
    .select('organization_id, business_unit_id, config, is_active')
    .eq('channel', 'whatsapp')

  for (const row of (buSettings ?? []) as Array<Record<string, unknown>>) {
    const cfg = row.config as
      | { phoneNumberId?: string; accessToken?: string }
      | null
    if (cfg?.phoneNumberId === phoneNumberId) {
      return {
        organizationId: row.organization_id as string,
        businessUnitId: row.business_unit_id as string,
        phoneNumberId,
        accessToken: cfg.accessToken,
        source: 'business_unit_channel_settings',
      }
    }
  }

  return null
}

/**
 * Helper para o simulador: dado um organization_id e (opcional) business_unit_id,
 * retorna a config Meta WhatsApp ativa. Olha primeiro em
 * organization_settings, depois em qualquer business unit ativa da org.
 */
export async function findAnyMetaConfigForOrg(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ResolvedMetaConfig | null> {
  // (A) organization_settings
  const { data: orgRow } = await supabase
    .from('organization_settings')
    .select('meta_whatsapp_config')
    .eq('organization_id', organizationId)
    .maybeSingle()

  const orgCfg = (orgRow as Record<string, unknown> | null)?.meta_whatsapp_config as
    | { phoneNumberId?: string; accessToken?: string }
    | null

  if (orgCfg?.phoneNumberId) {
    return {
      organizationId,
      businessUnitId: null,
      phoneNumberId: orgCfg.phoneNumberId,
      accessToken: orgCfg.accessToken,
      source: 'organization_settings',
    }
  }

  // (B) business_unit_channel_settings — pega a primeira BU ativa com phoneNumberId
  const { data: buRows } = await supabase
    .from('business_unit_channel_settings')
    .select('business_unit_id, config, is_active')
    .eq('organization_id', organizationId)
    .eq('channel', 'whatsapp')

  for (const row of (buRows ?? []) as Array<Record<string, unknown>>) {
    const cfg = row.config as
      | { phoneNumberId?: string; accessToken?: string }
      | null
    if (cfg?.phoneNumberId) {
      return {
        organizationId,
        businessUnitId: row.business_unit_id as string,
        phoneNumberId: cfg.phoneNumberId,
        accessToken: cfg.accessToken,
        source: 'business_unit_channel_settings',
      }
    }
  }

  return null
}
