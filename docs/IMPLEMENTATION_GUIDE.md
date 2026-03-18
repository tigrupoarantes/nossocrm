# NossoCRM — Guia de Implementação: Omnichannel + Landing Page Builder

> **IMPORTANTE:** Este documento é um guia de implementação para uso com Claude Code.
> Cada seção contém requisitos funcionais, especificação técnica, e código de referência
> seguindo os padrões exatos do projeto NossoCRM.

---

## Stack do Projeto

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Framework | Next.js (App Router) | ^16.0.10 |
| UI | React + TypeScript | 19.2.1 |
| Banco | Supabase (PostgreSQL) | @supabase/supabase-js ^2.87.1 |
| Auth | Supabase Auth | @supabase/ssr ^0.8.0 |
| IA | AI SDK v6 (Vercel) | ai ^6.0.72 |
| State | TanStack React Query | ^5.90.12 |
| Forms | React Hook Form + Zod | ^7.68.0 / ^4.1.13 |
| Estilo | Tailwind CSS + Radix UI | |
| Ícones | lucide-react | ^0.560.0 |

---

# PARTE 1 — PLATAFORMA OMNICHANNEL

---

## 1. Contexto & Problema

O NossoCRM já possui integração WhatsApp via WAHA. A conversa com o lead acontece na aba "Conversas" da Inbox, **separada** do deal card. Queremos:

1. Adicionar canais **Instagram DM** e **Facebook Messenger** via Meta Graph API
2. Permitir que o vendedor **converse com o lead de dentro do deal card**
3. Unificar a Inbox para mostrar conversas de **todos os canais**

## 2. Usuários Impactados

- [x] Vendedores — conversam com leads por múltiplos canais
- [x] Administradores — configuram canais e veem analytics

## 3. Requisitos Funcionais

### RF-01: Aba "Conversas" no Deal Card
- Ao abrir um deal, deve existir uma aba "Conversas" ao lado de "Timeline", "Produtos" e "IA Insights"
- A aba mostra uma **timeline unificada** de todas as mensagens do contato vinculado ao deal, independente do canal
- Cada mensagem exibe um **badge de canal** (WhatsApp verde, Instagram roxo, Facebook azul)
- Na parte inferior, um **input de mensagem** com seletor de canal
- O canal padrão é o **último canal usado pelo lead** (última mensagem inbound)
- O vendedor pode trocar o canal manualmente via dropdown
- Mensagens novas aparecem em **tempo real** via Supabase Realtime

### RF-02: Inbox Omnichannel
- A aba "Conversas" da Inbox deve listar conversas de **todos os canais**
- Filtros por canal: WhatsApp, Instagram, Facebook (checkboxes)
- Cada item da lista exibe o badge do canal
- Contagem de não-lidas é a soma de todos os canais
- Clicar numa conversa abre o thread no painel direito (como já funciona)

### RF-03: Integração Instagram DM
- Receber mensagens via **webhook da Meta** (Instagram Messaging API)
- Enviar mensagens via **Meta Graph API v19.0**
- Suportar mensagens de texto e imagens
- Vincular automaticamente ao contato existente (match por Instagram ID no campo `metadata`)
- Se não encontrar contato, criar um novo com nome do perfil Instagram

### RF-04: Integração Facebook Messenger
- Receber mensagens via **mesmo webhook da Meta** (Messenger Platform)
- Enviar mensagens via **Meta Graph API v19.0**
- Suportar mensagens de texto e imagens
- Vincular automaticamente ao contato existente (match por Facebook PSID)
- Se não encontrar contato, criar um novo

### RF-05: Configuração de Canais
- Nova seção em Configurações > Comunicação para gerenciar canais conectados
- Card visual por canal mostrando status (Conectado/Desconectado)
- Botão "Conectar com Meta Business" inicia OAuth flow
- Gerenciamento de tokens com renovação automática (token expira em 60 dias)
- Alerta visual quando token está próximo de expirar (< 7 dias)

### RF-06: Automação Multi-Canal
- O trigger `response_received` da automation engine deve funcionar para Instagram e Facebook
- Auto-criação de deal quando mensagem chega de contato novo (configurável por canal)

---

## 4. Especificação Técnica — Banco de Dados

### Migration 1: `20260318000000_omnichannel_conversations.sql`

```sql
-- ============================================================
-- Migration: Expandir conversations e messages para omnichannel
-- ============================================================

-- 1. Expandir conversations para novos canais
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ig_conversation_id TEXT,
  ADD COLUMN IF NOT EXISTS fb_conversation_id TEXT,
  ADD COLUMN IF NOT EXISTS channel_metadata JSONB DEFAULT '{}';

-- Remover constraint antiga de channel se existir
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_channel_check;

-- Adicionar nova constraint com todos os canais
ALTER TABLE conversations
  ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'facebook', 'email'));

-- Índices para busca por canal
CREATE INDEX IF NOT EXISTS idx_conversations_ig_id
  ON conversations(organization_id, ig_conversation_id)
  WHERE ig_conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_fb_id
  ON conversations(organization_id, fb_conversation_id)
  WHERE fb_conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_channel
  ON conversations(organization_id, channel);

-- Unique constraints para evitar duplicatas
ALTER TABLE conversations
  ADD CONSTRAINT conversations_ig_unique
  UNIQUE (organization_id, ig_conversation_id);

ALTER TABLE conversations
  ADD CONSTRAINT conversations_fb_unique
  UNIQUE (organization_id, fb_conversation_id);

-- 2. Expandir messages para multi-canal
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS external_message_id TEXT,
  ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id),
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Constraint de channel em messages
ALTER TABLE messages
  ADD CONSTRAINT messages_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'facebook', 'email'));

-- Constraint de message_type
ALTER TABLE messages
  ADD CONSTRAINT messages_type_check
  CHECK (message_type IN ('text', 'image', 'video', 'audio', 'file', 'story_reply', 'story_mention'));

-- Migrar dados existentes
UPDATE messages SET
  channel = 'whatsapp',
  external_message_id = wa_message_id
WHERE channel IS NULL AND wa_message_id IS NOT NULL;

-- Índice para busca por external_message_id (dedup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_id
  ON messages(organization_id, channel, external_message_id)
  WHERE external_message_id IS NOT NULL;
```

### Migration 2: `20260318000001_connected_channels.sql`

```sql
-- ============================================================
-- Migration: Tabela de canais conectados por organização
-- ============================================================

CREATE TABLE IF NOT EXISTS connected_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'facebook', 'email')),
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  access_token TEXT,
  refresh_token TEXT,
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (organization_id, channel, external_id)
);

-- RLS
ALTER TABLE connected_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_can_view_channels"
  ON connected_channels FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "admins_can_manage_channels"
  ON connected_channels FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Trigger updated_at
CREATE TRIGGER set_connected_channels_updated_at
  BEFORE UPDATE ON connected_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Adicionar meta_config à organization_settings
ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS meta_config JSONB;
-- Estrutura: { appId, appSecret, webhookVerifyToken }
```

### Migration 3: `20260318000002_landing_pages.sql`

```sql
-- ============================================================
-- Migration: Landing pages e submissões
-- ============================================================

CREATE TABLE IF NOT EXISTS landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identificação
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,

  -- Conteúdo
  html_content TEXT NOT NULL,
  prompt_used TEXT,
  ai_model TEXT,

  -- Configuração de captura
  target_board_id UUID REFERENCES boards(id),
  target_stage_id UUID,
  webhook_api_key TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  custom_fields JSONB DEFAULT '[]',
  thank_you_message TEXT DEFAULT 'Obrigado! Entraremos em contato em breve.',
  thank_you_redirect_url TEXT,

  -- SEO
  meta_title TEXT,
  meta_description TEXT,
  og_image_url TEXT,

  -- Tracking
  google_analytics_id TEXT,
  meta_pixel_id TEXT,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,

  -- Métricas (desnormalizadas)
  views_count INTEGER DEFAULT 0,
  submissions_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),

  UNIQUE (organization_id, slug)
);

ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_can_view_pages"
  ON landing_pages FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "admins_can_manage_pages"
  ON landing_pages FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager')
  ));

-- Índice para rota pública
CREATE INDEX idx_landing_pages_public
  ON landing_pages(slug)
  WHERE status = 'published';

-- Tabela de submissões
CREATE TABLE IF NOT EXISTS landing_page_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  landing_page_id UUID NOT NULL REFERENCES landing_pages(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id),
  deal_id UUID REFERENCES deals(id),
  form_data JSONB NOT NULL DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE landing_page_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation_submissions"
  ON landing_page_submissions FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Trigger métricas
CREATE OR REPLACE FUNCTION update_landing_page_metrics()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE landing_pages SET
    submissions_count = submissions_count + 1,
    updated_at = NOW()
  WHERE id = NEW.landing_page_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_submission_update_metrics
  AFTER INSERT ON landing_page_submissions
  FOR EACH ROW EXECUTE FUNCTION update_landing_page_metrics();

-- Trigger updated_at
CREATE TRIGGER set_landing_pages_updated_at
  BEFORE UPDATE ON landing_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 5. Tipos TypeScript

Adicionar ao arquivo `types/types.ts`:

```typescript
// ============================================================
// Omnichannel Types
// ============================================================

export type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'email';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'story_reply' | 'story_mention';

// Extend existing Message interface
export interface Message {
  id: string;
  organizationId: string;
  conversationId: string;
  waMessageId: string;          // manter para compatibilidade
  externalMessageId: string;    // NOVO: ID genérico da mensagem externa
  channel: Channel;             // NOVO: canal da mensagem
  messageType: MessageType;     // NOVO: tipo de conteúdo
  direction: MessageDirection;
  body: string;
  mediaUrl: string | null;
  status: MessageStatus;
  replyToId: string | null;     // NOVO: resposta a mensagem
  metadata: Record<string, unknown>; // NOVO: dados extras
  sentAt: string;
  createdAt: string;
}

// Extend existing Conversation interface
export interface Conversation {
  id: string;
  organizationId: string;
  contactId: string | null;
  dealId: string | null;
  channel: Channel;             // ALTERADO: de 'whatsapp' para Channel
  waChatId: string;
  igConversationId: string | null; // NOVO
  fbConversationId: string | null; // NOVO
  channelMetadata: Record<string, unknown>; // NOVO
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationWithContact extends Conversation {
  contacts?: { name: string; phone: string };
  deals?: { title: string };
}

// Connected Channel
export interface ConnectedChannel {
  id: string;
  organizationId: string;
  channel: Channel;
  externalId: string;
  name: string;
  avatarUrl: string | null;
  isActive: boolean;
  connectedAt: string;
  tokenExpiresAt: string | null;
  config: Record<string, unknown>;
}

// ============================================================
// Landing Page Types
// ============================================================

export type LandingPageStatus = 'draft' | 'published' | 'archived';

export interface LandingPage {
  id: string;
  organizationId: string;
  title: string;
  slug: string;
  description: string | null;
  htmlContent: string;
  promptUsed: string | null;
  aiModel: string | null;
  targetBoardId: string | null;
  targetStageId: string | null;
  webhookApiKey: string;
  customFields: LandingPageField[];
  thankYouMessage: string;
  thankYouRedirectUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImageUrl: string | null;
  googleAnalyticsId: string | null;
  metaPixelId: string | null;
  status: LandingPageStatus;
  publishedAt: string | null;
  viewsCount: number;
  submissionsCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface LandingPageField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select';
  required: boolean;
  placeholder?: string;
  options?: string[]; // para select
}

export interface LandingPageSubmission {
  id: string;
  organizationId: string;
  landingPageId: string;
  contactId: string | null;
  dealId: string | null;
  formData: Record<string, string>;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  createdAt: string;
}
```

---

## 6. API Routes — Omnichannel

### 6.1 Webhook Meta (Instagram + Facebook)

**Arquivo:** `app/api/webhooks/meta/route.ts`

```typescript
// GET — Verificação do webhook (Meta envia GET com challenge)
// POST — Receber mensagens de Instagram DM e Facebook Messenger
//
// Fluxo:
// 1. Validar x-hub-signature-256 (HMAC SHA256 do body com app secret)
// 2. Identificar canal: body.object === 'instagram' ou 'page'
// 3. Para cada entry.messaging[]:
//    a. Extrair sender ID, message text, media
//    b. Encontrar connected_channel pelo external_id da page/ig account
//    c. Encontrar ou criar contato pelo sender ID (field: metadata.ig_id ou metadata.fb_psid)
//    d. Encontrar deal ativo do contato
//    e. Upsert conversation (ig_conversation_id ou fb_conversation_id)
//    f. Insert message
//    g. Trigger automation: onResponseReceived()
// 4. Sempre retornar 200 OK (Meta reenvia se não receber 200)
//
// Usar: createStaticAdminClient() (mesmo padrão do webhook WAHA)
// Validação: HMAC SHA256 com timing-safe comparison
```

**Payload Instagram (entrada):**
```json
{
  "object": "instagram",
  "entry": [{
    "id": "INSTAGRAM_BUSINESS_ACCOUNT_ID",
    "time": 1710000000,
    "messaging": [{
      "sender": { "id": "SENDER_IGSID" },
      "recipient": { "id": "RECIPIENT_IGSID" },
      "timestamp": 1710000000,
      "message": {
        "mid": "MESSAGE_ID",
        "text": "Olá, quero saber mais!"
      }
    }]
  }]
}
```

**Payload Facebook Messenger (entrada):**
```json
{
  "object": "page",
  "entry": [{
    "id": "PAGE_ID",
    "time": 1710000000,
    "messaging": [{
      "sender": { "id": "SENDER_PSID" },
      "recipient": { "id": "PAGE_ID" },
      "timestamp": 1710000000,
      "message": {
        "mid": "MESSAGE_ID",
        "text": "Boa tarde, preciso de informação"
      }
    }]
  }]
}
```

### 6.2 Envio de Mensagens Unificado

**Arquivo:** `app/api/messages/send/route.ts`

```typescript
// POST /api/messages/send
//
// Request body (Zod schema):
// {
//   conversationId: string (UUID)
//   body: string
//   channel: 'whatsapp' | 'instagram' | 'facebook'
//   mediaUrl?: string
//   replyToId?: string (UUID)
// }
//
// Fluxo:
// 1. Auth check (createClient + getUser)
// 2. Buscar conversation e validar org_id
// 3. Buscar connected_channel ativo para o canal
// 4. Rotear envio:
//    - whatsapp → lib/communication/waha.ts (sendWahaMessage)
//    - instagram → lib/communication/meta-instagram.ts (sendInstagramMessage)
//    - facebook → lib/communication/meta-facebook.ts (sendFacebookMessage)
// 5. Inserir message com direction='outbound', status='sent'
// 6. Atualizar conversation.last_message_at
// 7. Retornar message criada
//
// Response: { data: Message }
// Errors: 401 Unauthorized, 403 Channel not connected, 500 Send failed
```

### 6.3 Conversas de um Deal

**Arquivo:** `app/api/deals/[id]/conversations/route.ts`

```typescript
// GET /api/deals/:id/conversations
//
// Retorna todas as conversas e mensagens vinculadas a um deal.
// Pode ter múltiplas conversas (uma por canal).
//
// Fluxo:
// 1. Auth check
// 2. Validar que o deal pertence à org do usuário
// 3. Buscar conversations WHERE deal_id = :id
// 4. Para cada conversation, buscar messages ORDER BY sent_at ASC
// 5. Retornar array unificado de mensagens com channel info
//
// Response:
// {
//   conversations: ConversationWithContact[],
//   messages: Message[],          // todas as msgs de todas as convs, ordenadas por sent_at
//   availableChannels: Channel[]  // canais ativos para este contato
// }
//
// Query params:
//   ?channel=whatsapp  (filtrar por canal, opcional)
//   ?limit=50          (limite de mensagens, default 50)
```

### 6.4 Canais Conectados

**Arquivo:** `app/api/channels/route.ts`

```typescript
// GET /api/channels — Listar canais conectados da organização
// Response: { data: ConnectedChannel[] }

// POST /api/channels/connect/meta/route.ts — Iniciar OAuth com Meta
// Request: { code: string } (authorization code do OAuth)
// Fluxo:
// 1. Trocar code por access_token (Graph API /oauth/access_token)
// 2. Buscar pages e IG accounts do usuário
// 3. Gerar page access token de longa duração (60 dias)
// 4. Inserir connected_channel para Instagram e/ou Facebook
// 5. Configurar webhook subscription na Meta

// DELETE /api/channels/[id]/route.ts — Desconectar canal
// 1. Marcar is_active = false
// 2. Limpar tokens

// POST /api/channels/[id]/refresh-token/route.ts — Renovar token
// 1. Chamar Graph API /oauth/access_token?grant_type=fb_exchange_token
// 2. Atualizar access_token e token_expires_at
```

---

## 7. API Routes — Landing Pages

### 7.1 CRUD

**Arquivo:** `app/api/landing-pages/route.ts`

```typescript
// GET /api/landing-pages — Listar landing pages da org
// Response: { data: LandingPage[], totalCount: number }
// Query params: ?status=published&page=0&pageSize=20

// POST /api/landing-pages — Criar nova (status=draft)
// Request body:
// {
//   title: string,
//   slug: string,           // auto-gerado se vazio
//   htmlContent: string,    // HTML completo
//   promptUsed?: string,
//   aiModel?: string,
//   targetBoardId?: string,
//   targetStageId?: string,
//   customFields?: LandingPageField[],
//   metaTitle?: string,
//   metaDescription?: string
// }
// Response: { data: LandingPage }
```

### 7.2 Geração com IA

**Arquivo:** `app/api/landing-pages/generate/route.ts`

```typescript
// POST /api/landing-pages/generate
//
// Request body:
// {
//   prompt: string,              // Descrição da landing page
//   organizationId: string,      // Para buscar dados da org (nome, logo, cores)
//   formFields: LandingPageField[], // Campos do formulário
//   webhookUrl: string,          // URL de captura
//   webhookApiKey: string        // API key para o formulário
// }
//
// Usa AI SDK v6 com generateText (não streaming):
//
// import { generateText } from 'ai'
// import { getAIProvider } from '@/lib/ai/provider'
//
// const model = await getAIProvider(organizationId)
// const result = await generateText({
//   model,
//   maxRetries: 2,
//   system: LANDING_PAGE_SYSTEM_PROMPT,  // ver seção 9
//   prompt: userPrompt
// })
//
// Response: { html: string, model: string }
```

### 7.3 Rota Pública — Servir Landing Page

**Arquivo:** `app/(pages)/p/[slug]/page.tsx`

```typescript
// Server Component — renderiza a landing page para visitantes
// Esta rota é PÚBLICA (não requer autenticação)
//
// Fluxo:
// 1. Buscar landing_page pelo slug WHERE status = 'published'
//    (usar createAdminClient pois é rota pública sem auth)
// 2. Se não encontrar, retornar notFound()
// 3. Incrementar views_count (fire-and-forget)
// 4. Renderizar o HTML dentro de um iframe ou dangerouslySetInnerHTML
//    (preferir iframe por segurança — sandbox isolado)
// 5. Injetar meta tags (title, description, og:image)
//
// Metadata:
// export async function generateMetadata({ params }) → buscar meta tags da LP
```

### 7.4 Captura de Leads

**Arquivo:** `app/api/p/[slug]/submit/route.ts`

```typescript
// POST /api/p/:slug/submit — Rota PÚBLICA para receber formulário
//
// Request body:
// {
//   name: string,
//   email?: string,
//   phone?: string,
//   [key: string]: string    // campos customizados
// }
//
// Headers:
//   x-api-key: string        // webhook_api_key da landing_page
//
// Fluxo:
// 1. Buscar landing_page pelo slug (admin client, sem auth)
// 2. Validar x-api-key contra landing_page.webhook_api_key
// 3. Extrair UTM params do body ou referrer
// 4. Criar ou atualizar contato (match por email ou phone)
// 5. Criar deal no target_board_id / target_stage_id
// 6. Inserir landing_page_submission com todos os dados
// 7. Retornar { ok: true, redirectUrl?: string }
//
// CORS: Permitir qualquer origem (a LP pode estar em qualquer domínio)
// Rate limit: Considerar implementar rate limit por IP
```

---

## 8. Estrutura de Arquivos (Novos)

```
features/
├── conversations/                          # NOVA feature
│   ├── index.ts                            # Re-exports
│   ├── types.ts                            # Tipos locais se necessário
│   ├── components/
│   │   ├── deal-conversations-tab.tsx       # Aba no deal card
│   │   ├── conversation-thread.tsx          # Timeline de mensagens multi-canal
│   │   ├── message-bubble.tsx               # Bolha com badge de canal
│   │   ├── message-input.tsx                # Input + seletor de canal + envio
│   │   ├── channel-badge.tsx                # Badge visual (WA/IG/FB)
│   │   └── channel-filter.tsx               # Checkboxes de filtro por canal
│   ├── hooks/
│   │   ├── use-deal-conversations.ts        # Query: mensagens de um deal
│   │   ├── use-send-message.ts              # Mutation: enviar mensagem multi-canal
│   │   └── use-channel-status.ts            # Query: status dos canais conectados
│   └── actions/
│       └── conversation-actions.ts
│
├── channels/                               # NOVA feature
│   ├── index.ts
│   ├── components/
│   │   ├── channels-list.tsx                # Lista de canais com status
│   │   ├── meta-connect-button.tsx          # Botão OAuth Meta Business
│   │   ├── channel-status-card.tsx          # Card individual do canal
│   │   └── token-refresh-alert.tsx          # Alerta de token expirando
│   ├── hooks/
│   │   └── use-channels.ts                  # CRUD de canais
│   └── actions/
│       └── channel-actions.ts
│
└── landing-pages/                          # NOVA feature
    ├── index.ts
    ├── types.ts
    ├── components/
    │   ├── landing-pages-list.tsx            # Lista com cards
    │   ├── landing-page-builder.tsx          # Tela principal do builder
    │   ├── prompt-input.tsx                  # Textarea com sugestões
    │   ├── live-preview.tsx                  # Iframe de preview
    │   ├── publish-dialog.tsx                # Modal de publicação
    │   ├── landing-page-analytics.tsx        # Dashboard de métricas
    │   ├── submissions-list.tsx              # Lista de leads capturados
    │   └── template-gallery.tsx              # Galeria de templates
    ├── hooks/
    │   ├── use-landing-pages.ts              # CRUD hooks
    │   ├── use-generate-page.ts             # Hook de geração IA
    │   └── use-landing-page-analytics.ts    # Métricas
    ├── actions/
    │   └── landing-page-actions.ts
    └── lib/
        ├── page-generator.ts                # System prompt e lógica
        ├── templates.ts                     # Templates base HTML
        └── slug-utils.ts                    # Geração de slugs

lib/
├── communication/
│   ├── waha.ts                              # JÁ EXISTE — manter
│   ├── meta-instagram.ts                    # NOVO
│   ├── meta-facebook.ts                     # NOVO
│   ├── meta-auth.ts                         # NOVO — OAuth e tokens
│   └── message-router.ts                    # NOVO — roteador multi-canal

app/
├── api/
│   ├── webhooks/
│   │   └── meta/route.ts                    # NOVO
│   ├── channels/
│   │   ├── route.ts                         # NOVO — GET lista
│   │   ├── connect/meta/route.ts            # NOVO — POST OAuth
│   │   └── [id]/
│   │       ├── route.ts                     # NOVO — DELETE desconectar
│   │       └── refresh-token/route.ts       # NOVO — POST renovar
│   ├── messages/
│   │   └── send/route.ts                    # NOVO — POST envio unificado
│   ├── deals/
│   │   └── [id]/
│   │       └── conversations/route.ts       # NOVO — GET conversas do deal
│   ├── landing-pages/
│   │   ├── route.ts                         # NOVO — GET/POST CRUD
│   │   ├── [id]/
│   │   │   ├── route.ts                     # NOVO — GET/PATCH/DELETE
│   │   │   ├── publish/route.ts             # NOVO — POST publicar
│   │   │   ├── analytics/route.ts           # NOVO — GET métricas
│   │   │   └── submissions/route.ts         # NOVO — GET submissões
│   │   └── generate/route.ts               # NOVO — POST gerar com IA
│   └── p/
│       └── [slug]/
│           └── submit/route.ts              # NOVO — POST captura (público)
├── (protected)/
│   └── landing-pages/
│       ├── page.tsx                          # NOVO — lista
│       └── [id]/
│           └── page.tsx                     # NOVO — builder/editor
└── (pages)/
    └── p/
        └── [slug]/
            └── page.tsx                     # NOVO — renderizar LP (público)
```

---

## 9. System Prompt — Geração de Landing Pages

**Arquivo:** `features/landing-pages/lib/page-generator.ts`

```typescript
export const LANDING_PAGE_SYSTEM_PROMPT = `Você é um especialista em design de landing pages de alta conversão.

TAREFA: Gere o HTML COMPLETO de uma landing page profissional.

REGRAS TÉCNICAS OBRIGATÓRIAS:
1. HTML auto-contido (um único arquivo, sem dependências externas exceto CDNs)
2. Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
3. Google Fonts via <link> no <head>
4. Mobile-first, 100% responsivo (testar em 375px e 1440px)
5. Imagens: usar URLs do Unsplash (https://images.unsplash.com/...)
6. Formulário de captura pré-configurado (ver FORMULÁRIO abaixo)
7. Retornar APENAS o HTML, sem markdown, sem explicações, sem code fences

SEÇÕES OBRIGATÓRIAS (nesta ordem):
1. <header> com logo/nome da empresa e navegação ancora
2. Hero section com headline impactante, subtítulo e CTA principal
3. Benefícios/Features (3-6 itens com ícones SVG inline)
4. Social proof (depoimentos com foto, nome e cargo)
5. Formulário de captura com campos configurados
6. FAQ (3-5 perguntas frequentes com accordion simples em JS)
7. <footer> com informações legais e links

ESTILO VISUAL:
- Moderno, clean, profissional
- Gradients sutis (não exagerar)
- Sombras suaves (shadow-lg, shadow-xl)
- Bordas arredondadas (rounded-xl, rounded-2xl)
- Microinterações CSS (hover:scale-105, transition-all duration-300)
- Contraste WCAG AA mínimo
- Font-display: swap em todas as fontes
- Lazy loading em imagens: loading="lazy"

FORMULÁRIO DE CAPTURA:
O formulário deve usar este JavaScript exato:
\`\`\`
<form id="lead-form" class="space-y-4">
  {{FORM_FIELDS_HTML}}
  <button type="submit" class="w-full bg-primary text-white py-3 px-6 rounded-xl font-semibold hover:bg-primary/90 transition-all duration-300">
    {{CTA_TEXT}}
  </button>
  <p id="form-status" class="text-sm text-center hidden"></p>
</form>

<script>
document.getElementById('lead-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = this.querySelector('button[type="submit"]');
  const status = document.getElementById('form-status');
  const formData = new FormData(this);
  const data = Object.fromEntries(formData.entries());

  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const res = await fetch('{{WEBHOOK_URL}}', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': '{{API_KEY}}'
      },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      {{REDIRECT_OR_MESSAGE}}
    } else {
      status.textContent = 'Erro ao enviar. Tente novamente.';
      status.className = 'text-sm text-center text-red-500';
      status.classList.remove('hidden');
    }
  } catch (err) {
    status.textContent = 'Erro de conexão. Tente novamente.';
    status.className = 'text-sm text-center text-red-500';
    status.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = '{{CTA_TEXT}}';
  }
});
</script>
\`\`\`

DADOS DA ORGANIZAÇÃO:
- Nome: {{ORG_NAME}}
- Cores da marca: {{BRAND_COLORS}}

SEO:
Incluir no <head>:
- <title>, <meta name="description">
- Open Graph tags (og:title, og:description, og:image, og:url)
- Schema.org Organization markup (JSON-LD)
- viewport meta tag
- charset utf-8`;
```

---

## 10. Lib de Comunicação — Meta APIs

### 10.1 Instagram DM

**Arquivo:** `lib/communication/meta-instagram.ts`

```typescript
// Funções:
//
// sendInstagramMessage(params: SendMetaMessageParams): Promise<MetaSendResult>
//   - POST https://graph.facebook.com/v19.0/me/messages
//   - Headers: Authorization: Bearer {pageAccessToken}
//   - Body: { recipient: { id: recipientId }, message: { text: body } }
//   - Para imagens: message: { attachment: { type: 'image', payload: { url: mediaUrl } } }
//
// getInstagramProfile(userId: string, accessToken: string): Promise<IGProfile>
//   - GET https://graph.facebook.com/v19.0/{userId}?fields=name,profile_pic&access_token={token}
//
// Tipos:
// interface SendMetaMessageParams {
//   recipientId: string;      // Instagram-scoped user ID
//   body: string;
//   mediaUrl?: string;
//   accessToken: string;      // Page access token
// }
//
// interface MetaSendResult {
//   recipientId: string;
//   messageId: string;
// }
```

### 10.2 Facebook Messenger

**Arquivo:** `lib/communication/meta-facebook.ts`

```typescript
// Funções:
//
// sendFacebookMessage(params: SendMetaMessageParams): Promise<MetaSendResult>
//   - POST https://graph.facebook.com/v19.0/me/messages
//   - Headers: Authorization: Bearer {pageAccessToken}
//   - Body: { recipient: { id: psid }, message: { text: body } }
//   - Para imagens: message: { attachment: { type: 'image', payload: { url: mediaUrl } } }
//
// getFacebookUserProfile(psid: string, accessToken: string): Promise<FBProfile>
//   - GET https://graph.facebook.com/v19.0/{psid}?fields=first_name,last_name,profile_pic&access_token={token}
```

### 10.3 Message Router

**Arquivo:** `lib/communication/message-router.ts`

```typescript
// Roteador central que abstrai o envio por canal
//
// import { sendWahaMessage } from './waha'
// import { sendInstagramMessage } from './meta-instagram'
// import { sendFacebookMessage } from './meta-facebook'
//
// interface SendMessageParams {
//   channel: Channel;
//   recipientId: string;       // wa_chat_id, ig_user_id, ou fb_psid
//   body: string;
//   mediaUrl?: string;
//   accessToken?: string;      // para Meta APIs
//   wahaConfig?: WahaConfig;   // para WhatsApp
// }
//
// export async function routeMessage(params: SendMessageParams): Promise<{ messageId: string }> {
//   switch (params.channel) {
//     case 'whatsapp':
//       return sendWahaMessage({ to: params.recipientId, body: params.body, wahaConfig: params.wahaConfig! });
//     case 'instagram':
//       return sendInstagramMessage({ recipientId: params.recipientId, body: params.body, accessToken: params.accessToken! });
//     case 'facebook':
//       return sendFacebookMessage({ recipientId: params.recipientId, body: params.body, accessToken: params.accessToken! });
//     default:
//       throw new Error(`Canal não suportado: ${params.channel}`);
//   }
// }
```

### 10.4 Meta OAuth

**Arquivo:** `lib/communication/meta-auth.ts`

```typescript
// Funções para gerenciar autenticação com Meta Business
//
// getMetaAuthUrl(redirectUri: string, state: string): string
//   - Gera URL de autorização OAuth:
//     https://www.facebook.com/v19.0/dialog/oauth?
//       client_id={APP_ID}&
//       redirect_uri={redirectUri}&
//       state={state}&
//       scope=instagram_manage_messages,pages_messaging,pages_manage_metadata,pages_show_list
//
// exchangeCodeForToken(code: string, redirectUri: string): Promise<{ accessToken: string, expiresIn: number }>
//   - POST https://graph.facebook.com/v19.0/oauth/access_token
//     ?client_id={APP_ID}&client_secret={APP_SECRET}&redirect_uri={redirectUri}&code={code}
//
// getLongLivedToken(shortLivedToken: string): Promise<{ accessToken: string, expiresIn: number }>
//   - GET https://graph.facebook.com/v19.0/oauth/access_token
//     ?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={token}
//
// getPageAccessToken(userToken: string, pageId: string): Promise<string>
//   - GET https://graph.facebook.com/v19.0/{pageId}?fields=access_token&access_token={userToken}
//
// getUserPages(userToken: string): Promise<MetaPage[]>
//   - GET https://graph.facebook.com/v19.0/me/accounts?access_token={userToken}
//
// getUserInstagramAccount(pageId: string, pageToken: string): Promise<{ id: string, name: string }>
//   - GET https://graph.facebook.com/v19.0/{pageId}?fields=instagram_business_account{id,name,profile_picture_url}&access_token={pageToken}
//
// subscribeWebhook(pageId: string, pageToken: string): Promise<void>
//   - POST https://graph.facebook.com/v19.0/{pageId}/subscribed_apps
//     ?subscribed_fields=messages&access_token={pageToken}
```

---

## 11. Componentes React — Referência de Implementação

### 11.1 DealConversationsTab

```typescript
// features/conversations/components/deal-conversations-tab.tsx
//
// Props:
//   dealId: string
//   contactId: string
//
// Hooks usados:
//   useDealConversations(dealId) → { messages, conversations, availableChannels, isLoading }
//   useSendMessage() → mutation
//   useChannelStatus() → { channels, isConnected(channel) }
//
// Comportamento:
// - Exibe ConversationThread com todas as mensagens do deal
// - Na parte inferior, MessageInput com ChannelSelector
// - Canal padrão = última mensagem inbound do contato
// - Supabase Realtime: subscribe to messages WHERE conversation_id IN (deal conversations)
//
// Padrão do componente (seguir InboxConversationsView.tsx):
// 'use client';
// import React, { useEffect, useRef } from 'react';
// Named export: export function DealConversationsTab({ dealId, contactId }: Props)
```

### 11.2 ChannelBadge

```typescript
// features/conversations/components/channel-badge.tsx
//
// Props:
//   channel: Channel
//   size?: 'sm' | 'md'     // default 'sm'
//
// Renderiza ícone + cor por canal:
//   whatsapp  → ícone MessageSquare, bg-green-500
//   instagram → ícone Instagram (lucide), bg-purple-500
//   facebook  → ícone Facebook (lucide), bg-blue-500
//   email     → ícone Mail, bg-gray-500
//
// Exemplo de uso:
// <ChannelBadge channel="instagram" />
// Renderiza: <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-500 text-xs">
//              <Instagram className="w-3 h-3" /> IG
//            </span>
```

### 11.3 LandingPageBuilder

```typescript
// features/landing-pages/components/landing-page-builder.tsx
//
// Props:
//   landingPageId?: string  // undefined = criar nova, string = editar existente
//
// Hooks:
//   useLandingPage(id) → { data, isLoading } (se editando)
//   useGeneratePage() → { generate, isGenerating }
//   useBoards() → { boards } (para select de board destino)
//
// State local:
//   prompt: string
//   htmlContent: string
//   previewMode: 'desktop' | 'mobile'
//   config: { title, slug, targetBoardId, targetStageId, metaTitle, ... }
//
// Layout:
// ┌─────────────────────────────────────────┐
// │ Header: título + status badge           │
// ├─────────────────────────────────────────┤
// │ PromptInput (textarea)                  │
// │ [Gerar] [Usar Template]                 │
// ├─────────────────────────────────────────┤
// │ LivePreview (iframe srcdoc={htmlContent})│
// │ [Mobile] [Desktop] toggle               │
// ├─────────────────────────────────────────┤
// │ Ajustar: textarea para refinamento      │
// │ [Aplicar Ajuste]                        │
// ├─────────────────────────────────────────┤
// │ Config (slug, SEO) | Captura (board)    │
// ├─────────────────────────────────────────┤
// │ [Regenerar] [Publicar] [Analytics]      │
// └─────────────────────────────────────────┘
```

---

## 12. Integração com Deal Card Existente

O deal card atual está em `features/deals/cockpit/` e usa `FocusContextPanel`. As abas atuais são: **Timeline**, **Produtos**, **IA Insights**.

**Ação necessária:**
1. Localizar o componente que renderiza as abas do deal card (provavelmente em `FocusContextPanel` ou componente filho)
2. Adicionar uma nova aba "Conversas" que renderiza `<DealConversationsTab dealId={deal.id} contactId={deal.contactId} />`
3. A aba deve mostrar badge com contagem de mensagens não-lidas
4. Se não houver conversas, mostrar empty state: "Nenhuma conversa ainda. Inicie uma conversa com o contato."

---

## 13. Navegação — Sidebar

Adicionar ao sidebar (menu lateral):

```
Inbox
Visão Geral
Boards
Contatos
Atividades
Landing Pages    ← NOVO (ícone: Layout ou FileText do lucide-react)
Relatórios
Configurações
```

---

## 14. Configurações — Nova Seção

Na tela de **Configurações > Comunicação**, adicionar seção de canais conectados ACIMA das configs existentes (SMTP, Twilio, WAHA):

```
Canais Conectados
├── WhatsApp (WAHA)     → status: Conectado/Desconectado
├── Instagram           → status: Conectado/Desconectado + [Conectar com Meta]
├── Facebook Messenger  → status: Conectado/Desconectado + [Conectar com Meta]
└── E-mail (SMTP)       → status: Configurado/Não configurado

---
Configurações Detalhadas (já existem):
├── E-mail (SMTP)
├── WhatsApp (Twilio)
├── SERASA Experian
├── Base de Clientes FLAG/SAP
└── WhatsApp (WAHA)
```

---

## 15. Ordem de Implementação

Execute nesta ordem para minimizar dependências:

### Sprint 1 (Semana 1-2): Infraestrutura
1. Rodar as 3 migrations SQL
2. Atualizar `types/types.ts` com novos tipos
3. Criar `lib/communication/message-router.ts`
4. Criar `lib/communication/meta-instagram.ts` (pode ser stub inicialmente)
5. Criar `lib/communication/meta-facebook.ts` (pode ser stub inicialmente)
6. Criar `app/api/messages/send/route.ts`
7. Criar `app/api/deals/[id]/conversations/route.ts`
8. Criar `features/conversations/` com todos os componentes
9. Integrar aba "Conversas" no deal card

### Sprint 2 (Semana 3-4): Landing Pages MVP
1. Criar `features/landing-pages/` com todos os componentes
2. Criar `features/landing-pages/lib/page-generator.ts` com system prompt
3. Criar `app/api/landing-pages/` (CRUD + generate)
4. Criar `app/(pages)/p/[slug]/page.tsx` (rota pública)
5. Criar `app/api/p/[slug]/submit/route.ts` (captura de leads)
6. Adicionar "Landing Pages" ao sidebar
7. Criar `app/(protected)/landing-pages/page.tsx` e `[id]/page.tsx`

### Sprint 3 (Semana 5-6): Meta Integration
1. Criar `lib/communication/meta-auth.ts` (OAuth completo)
2. Criar `app/api/webhooks/meta/route.ts` (webhook handler)
3. Criar `app/api/channels/` (CRUD + OAuth + refresh)
4. Criar `features/channels/` com componentes
5. Atualizar tela de Configurações > Comunicação
6. Integrar envio real de mensagens Instagram e Facebook

### Sprint 4 (Semana 7-8): Polimento
1. Refatorar Inbox para ser omnichannel (filtros por canal)
2. Templates de landing pages (10-15 templates HTML)
3. Analytics de landing pages (views, conversão)
4. Renovação automática de tokens Meta
5. Testes

---

## 16. Variáveis de Ambiente Necessárias

```env
# Meta Business (Instagram + Facebook)
META_APP_ID=                          # App ID do Meta Business
META_APP_SECRET=                      # App Secret
META_WEBHOOK_VERIFY_TOKEN=            # Token customizado para verificação de webhook

# Landing Pages
NEXT_PUBLIC_LP_BASE_URL=              # URL base para landing pages (ex: https://gacrm.vercel.app/p)
```

---

## 17. Critérios de Aceite

### Omnichannel
- [ ] Aba "Conversas" funcional no deal card com mensagens WhatsApp
- [ ] Envio de mensagens pelo deal card funcionando
- [ ] Webhook Meta recebendo mensagens de Instagram (testado com Meta Webhook Test Tool)
- [ ] Webhook Meta recebendo mensagens de Facebook Messenger
- [ ] Envio de mensagens Instagram e Facebook funcionando
- [ ] Badge de canal visível em cada mensagem
- [ ] Seletor de canal no input de mensagem
- [ ] Supabase Realtime atualizando mensagens em tempo real
- [ ] Inbox mostrando conversas de todos os canais com filtros
- [ ] Configuração de canais com OAuth Meta funcionando
- [ ] Multi-tenancy: isolamento por organization_id em todas as queries
- [ ] Automação `response_received` disparando para IG e FB

### Landing Pages
- [ ] Vendedor descreve prompt → IA gera HTML completo
- [ ] Preview em iframe responsivo (mobile/desktop toggle)
- [ ] Publicação com slug customizável
- [ ] Landing page acessível via URL pública `/p/{slug}`
- [ ] Formulário da LP cria contato + deal no pipeline correto
- [ ] Lista de landing pages com status (draft/published)
- [ ] Métricas: views e submissões contabilizadas
- [ ] Lista de submissões com link para deal/contato criado
- [ ] "Ajustar com IA" faz refinamento incremental do HTML
- [ ] Multi-tenancy: isolamento por organization_id

---

## 18. Referências de Código Existente

Para manter consistência, use estes arquivos como referência:

| Padrão | Arquivo de Referência |
|--------|----------------------|
| API Route com auth + org_id | `app/api/conversations/route.ts` |
| Webhook com admin client | `app/api/webhooks/waha/route.ts` |
| React Query hooks | `lib/query/hooks/useConversationsQuery.ts` |
| Feature component | `features/inbox/components/InboxConversationsView.tsx` |
| Tipos globais | `types/types.ts` |
| AI SDK generateText | `app/api/ai/tasks/deals/email-draft/route.ts` |
| AI SDK streaming | `app/api/ai/chat/route.ts` |
| Settings com masking | `app/api/settings/communication/route.ts` |
| Deal cockpit | `features/deals/cockpit/DealCockpitFocusClient.tsx` |
| Service layer | `lib/supabase/index.ts` |
| Supabase server client | `lib/supabase/server.ts` |
| Supabase browser client | `lib/supabase/client.ts` |
| Migration format | `supabase/migrations/20260317000000_waha_conversations.sql` |
