/**
 * Migration: Omnichannel Schema Expansion
 *
 * Expande conversations e messages para suportar múltiplos canais:
 * WhatsApp (WAHA), Instagram DM e Facebook Messenger.
 *
 * Mudanças:
 * - conversations.wa_chat_id passa a ser nullable (IG/FB não têm wa_chat_id)
 * - conversations ganha ig_conversation_id, fb_conversation_id, channel_metadata
 * - conversations.channel constraint expandida para incluir instagram, facebook, email
 * - messages.wa_message_id passa a ser nullable
 * - messages ganha channel, external_message_id (genérico), message_type, reply_to_id, metadata
 * - Dados existentes migrados: wa_message_id → external_message_id
 */

-- =============================================================================
-- CONVERSATIONS — Expandir para multi-canal
-- =============================================================================

ALTER TABLE conversations
  ALTER COLUMN wa_chat_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS ig_conversation_id TEXT,
  ADD COLUMN IF NOT EXISTS fb_conversation_id TEXT,
  ADD COLUMN IF NOT EXISTS channel_metadata JSONB DEFAULT '{}';

-- Atualizar constraint de channel para incluir novos canais
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_channel_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'facebook', 'email'));

-- Índices parciais únicos para IG e FB (apenas quando o campo não é nulo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_ig_unique
  ON conversations(organization_id, ig_conversation_id)
  WHERE ig_conversation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_fb_unique
  ON conversations(organization_id, fb_conversation_id)
  WHERE fb_conversation_id IS NOT NULL;

-- =============================================================================
-- MESSAGES — Expandir para multi-canal
-- =============================================================================

ALTER TABLE messages
  ALTER COLUMN wa_message_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS external_message_id TEXT,
  ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Migrar dados existentes: copiar wa_message_id → external_message_id
UPDATE messages
  SET
    channel = 'whatsapp',
    external_message_id = wa_message_id
  WHERE wa_message_id IS NOT NULL
    AND external_message_id IS NULL;

-- Constraint de channel
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_channel_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'facebook', 'email'));

-- Constraint de message_type
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'video', 'audio', 'file', 'story_reply', 'story_mention', 'reaction'));

-- Índice único genérico por (organization_id, external_message_id) — idempotência multi-canal
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_unique
  ON messages(organization_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

-- Índice para busca por canal dentro de uma conversa
CREATE INDEX IF NOT EXISTS idx_messages_channel
  ON messages(conversation_id, channel, sent_at DESC);
