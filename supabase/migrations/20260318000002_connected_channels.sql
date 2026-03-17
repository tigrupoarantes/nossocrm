/**
 * Migration: Connected Channels
 *
 * Tabela para gerenciar canais de comunicação conectados por organização.
 * Suporta múltiplas contas/páginas por organização.
 *
 * Exemplos de registros:
 * - WhatsApp WAHA: channel='whatsapp', external_id='default' (nome da sessão)
 * - Instagram:     channel='instagram', external_id='17841400000000' (IG account ID)
 * - Facebook:      channel='facebook', external_id='100000000000000' (page ID)
 */

CREATE TABLE IF NOT EXISTS connected_channels (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel          TEXT        NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'facebook', 'email')),
  external_id      TEXT        NOT NULL,              -- ID externo da conta/página/sessão
  name             TEXT        NOT NULL,              -- Nome exibido (ex.: "Página Acme")
  avatar_url       TEXT,                              -- Foto do perfil/ícone do canal
  access_token     TEXT,                              -- Token de acesso (armazenar criptografado em produção)
  config           JSONB       DEFAULT '{}',          -- Configurações extras do canal
  is_active        BOOLEAN     DEFAULT true,
  expires_at       TIMESTAMPTZ,                       -- Quando o access_token expira (nulo = não expira)
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (organization_id, channel, external_id)
);

-- RLS
ALTER TABLE connected_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view connected channels"
  ON connected_channels FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage connected channels"
  ON connected_channels FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Trigger updated_at (reutiliza função criada em 20260310000000)
CREATE TRIGGER connected_channels_set_updated_at
  BEFORE UPDATE ON connected_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Índices
CREATE INDEX IF NOT EXISTS idx_connected_channels_org
  ON connected_channels(organization_id, channel)
  WHERE is_active = true;
