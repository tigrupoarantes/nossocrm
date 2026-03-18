/**
 * Migration: Meta Business Config
 *
 * Adiciona coluna meta_config em organization_settings para armazenar
 * credenciais da Meta Graph API (Instagram DM + Facebook Messenger).
 *
 * Estrutura esperada do JSONB:
 * {
 *   "appId": "123456789",
 *   "appSecret": "••••••••",           -- mascarado nas respostas de API
 *   "pageAccessToken": "••••••••",     -- token de longa duração (60 dias)
 *   "instagramAccountId": "17841400000000",
 *   "facebookPageId": "100000000000000",
 *   "webhookVerifyToken": "random-token",
 *   "connectedChannels": ["instagram", "facebook"]
 * }
 */

ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS meta_config JSONB;
