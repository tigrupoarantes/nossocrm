/**
 * Resolvers de configuração de WhatsApp (Meta Cloud API + WAHA).
 *
 * Cada provider de inbound/outbound chega com um identificador diferente
 * que precisa ser mapeado para uma organização do CRM:
 *
 *   - Meta Cloud API: phone_number_id no payload do webhook
 *   - WAHA:           session name no payload do webhook
 *
 * Estas funções centralizam essa resolução, olhando em ambos os lugares
 * onde a config pode estar (organization_settings ou
 * business_unit_channel_settings para orgs Multi-BU).
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

// =============================================================================
// WAHA resolvers
// =============================================================================

export interface ResolvedWahaConfig {
  organizationId: string
  sessionName: string
  baseUrl?: string
  apiKey?: string
  source: 'organization_settings' | 'business_unit_channel_settings'
}

/**
 * Resolve a organização dona desta sessão WAHA. O webhook do WAHA envia
 * `session: 'Whats_CRM'` no payload, e o `waha_config.sessionName` no
 * banco bate com isso.
 */
export async function resolveWahaConfigBySession(
  supabase: SupabaseClient,
  sessionName: string | null | undefined,
): Promise<ResolvedWahaConfig | null> {
  if (!sessionName) return null

  // (A) organization_settings.waha_config
  const { data: orgRows } = await supabase
    .from('organization_settings')
    .select('organization_id, waha_config')
    .not('waha_config', 'is', null)

  for (const row of (orgRows ?? []) as Array<Record<string, unknown>>) {
    const cfg = row.waha_config as
      | { sessionName?: string; baseUrl?: string; apiKey?: string }
      | null
    if (cfg?.sessionName === sessionName) {
      return {
        organizationId: row.organization_id as string,
        sessionName,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        source: 'organization_settings',
      }
    }
  }

  // (B) business_unit_channel_settings (caso WAHA configurado por BU)
  const { data: buRows } = await supabase
    .from('business_unit_channel_settings')
    .select('organization_id, business_unit_id, config')
    .eq('channel', 'whatsapp')

  for (const row of (buRows ?? []) as Array<Record<string, unknown>>) {
    const cfg = row.config as
      | { sessionName?: string; baseUrl?: string; apiKey?: string }
      | null
    if (cfg?.sessionName === sessionName) {
      return {
        organizationId: row.organization_id as string,
        sessionName,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        source: 'business_unit_channel_settings',
      }
    }
  }

  return null
}

/**
 * Para o simulador WAHA. Retorna a primeira config WAHA configurada na
 * org (geralmente só existe uma).
 */
export async function findAnyWahaConfigForOrg(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ResolvedWahaConfig | null> {
  // (A) organization_settings.waha_config
  const { data: orgRow } = await supabase
    .from('organization_settings')
    .select('waha_config')
    .eq('organization_id', organizationId)
    .maybeSingle()

  const orgCfg = (orgRow as Record<string, unknown> | null)?.waha_config as
    | { sessionName?: string; baseUrl?: string; apiKey?: string }
    | null

  if (orgCfg?.sessionName) {
    return {
      organizationId,
      sessionName: orgCfg.sessionName,
      baseUrl: orgCfg.baseUrl,
      apiKey: orgCfg.apiKey,
      source: 'organization_settings',
    }
  }

  // (B) business_unit_channel_settings
  const { data: buRows } = await supabase
    .from('business_unit_channel_settings')
    .select('business_unit_id, config')
    .eq('organization_id', organizationId)
    .eq('channel', 'whatsapp')

  for (const row of (buRows ?? []) as Array<Record<string, unknown>>) {
    const cfg = row.config as
      | { sessionName?: string; baseUrl?: string; apiKey?: string }
      | null
    if (cfg?.sessionName) {
      return {
        organizationId,
        sessionName: cfg.sessionName,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        source: 'business_unit_channel_settings',
      }
    }
  }

  return null
}
