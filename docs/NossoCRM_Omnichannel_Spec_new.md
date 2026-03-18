# NossoCRM — Plataforma Omnichannel

## Especificação Técnica & Plano de Implementação

**Data:** 17/03/2026
**Autor:** William Cintra + Claude
**Status:** Draft — Em Discussão

---

## 1. Visão Geral

Transformar o NossoCRM de um CRM com integração WhatsApp em uma **plataforma de comunicação omnichannel**, onde o vendedor interage com seus leads por WhatsApp, Instagram DM e Facebook Messenger — tudo de dentro do card do deal, sem sair do contexto de negociação.

### O Que Muda

| Hoje | Futuro |
|------|--------|
| Conversas apenas WhatsApp (WAHA) | WhatsApp + Instagram DM + Facebook Messenger |
| Aba "Conversas" separada na Inbox | Conversas dentro do card do deal + Inbox unificada |
| Canal único por conversa | Timeline unificada multi-canal |
| Configuração só WAHA | Painel Meta Business integrado |

### Princípios

1. **Conversa vive no deal** — o vendedor abre o card e conversa ali dentro
2. **Canal transparente** — o sistema mostra de onde veio a mensagem, mas a experiência é unificada
3. **Contato único** — um lead pode falar por WhatsApp e Instagram; o sistema unifica no mesmo contato
4. **Inbox como central de comando** — visão macro de todas as conversas, independente do canal

---

## 2. Arquitetura de Integração

### 2.1 APIs Utilizadas

| Canal | API | Modelo |
|-------|-----|--------|
| WhatsApp | WAHA (atual) | Self-hosted, gratuito |
| WhatsApp (futuro) | WhatsApp Cloud API (Meta) | Oficial, pago por mensagem |
| Instagram DM | Instagram Messaging API (Meta Graph API) | Oficial, requer app aprovado |
| Facebook Messenger | Messenger Platform (Meta Graph API) | Oficial, requer app aprovado |

### 2.2 Meta Graph API — O Que Precisa

Para Instagram e Facebook, é necessário:

1. **Criar um App no Meta Business** (developers.facebook.com)
2. **Solicitar permissões**:
   - `instagram_manage_messages` — enviar/receber DMs do Instagram
   - `pages_messaging` — enviar/receber mensagens no Messenger
   - `pages_manage_metadata` — informações da página
3. **Configurar Webhooks** — receber notificações de novas mensagens
4. **Gerar tokens de longa duração** — Page Access Token (60 dias, renovável)
5. **App Review** — submeter para aprovação da Meta (leva 5-10 dias úteis)

### 2.3 Fluxo de Mensagens

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│  WhatsApp    │────>│  WAHA Webhook    │────>│               │
│  (WAHA)      │     │  /api/webhooks/  │     │               │
└─────────────┘     │  waha             │     │               │
                    └──────────────────┘     │               │
┌─────────────┐     ┌──────────────────┐     │  NossoCRM     │
│  Instagram   │────>│  Meta Webhook    │────>│  Conversations│
│  DM          │     │  /api/webhooks/  │     │  Engine       │
└─────────────┘     │  meta            │     │               │
                    └──────────────────┘     │               │
┌─────────────┐     ┌──────────────────┐     │               │
│  Facebook    │────>│  Meta Webhook    │────>│               │
│  Messenger   │     │  (mesmo endpoint)│     │               │
└─────────────┘     └──────────────────┘     └───────┬───────┘
                                                      │
                                              ┌───────▼───────┐
                                              │  Deal Card    │
                                              │  Aba Conversas│
                                              └───────────────┘
```

### 2.4 Envio de Mensagens

```
┌───────────────┐     ┌──────────────────┐     ┌───────────────┐
│  Deal Card    │────>│  /api/messages/  │────>│  Router       │
│  Input de msg │     │  send            │     │  (por canal)  │
└───────────────┘     └──────────────────┘     └───────┬───────┘
                                                        │
                                          ┌─────────────┼─────────────┐
                                          │             │             │
                                    ┌─────▼─────┐ ┌────▼────┐ ┌─────▼─────┐
                                    │  WAHA     │ │  Meta   │ │  Meta     │
                                    │  WhatsApp │ │  IG API │ │  FB API   │
                                    └───────────┘ └─────────┘ └───────────┘
```

---

## 3. Modelo de Dados

### 3.1 Tabelas Atuais (Já Existem)

- `conversations` — já tem campo `channel` (hoje só 'whatsapp')
- `messages` — estrutura genérica (direction, body, status, media_url)
- `contact_channel_preferences` — opt-in/out por canal
- `business_unit_channel_settings` — config por unidade de negócio

### 3.2 Alterações Necessárias

#### Migration 1: Expandir `conversations`

```sql
-- Adicionar suporte a novos canais
ALTER TABLE conversations
  ADD COLUMN ig_conversation_id TEXT,      -- Instagram conversation ID
  ADD COLUMN fb_conversation_id TEXT,      -- Facebook conversation ID
  ADD COLUMN channel_metadata JSONB DEFAULT '{}'; -- Dados extras do canal

-- Atualizar constraint de channel
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN ('whatsapp', 'instagram', 'facebook', 'email'));

-- Índices para busca por canal
CREATE INDEX idx_conversations_ig_id
  ON conversations(organization_id, ig_conversation_id)
  WHERE ig_conversation_id IS NOT NULL;

CREATE INDEX idx_conversations_fb_id
  ON conversations(organization_id, fb_conversation_id)
  WHERE fb_conversation_id IS NOT NULL;

-- Unique constraints
ALTER TABLE conversations
  ADD CONSTRAINT conversations_ig_unique
  UNIQUE (organization_id, ig_conversation_id);

ALTER TABLE conversations
  ADD CONSTRAINT conversations_fb_unique
  UNIQUE (organization_id, fb_conversation_id);
```

#### Migration 2: Expandir `messages`

```sql
-- Adicionar campos para mensagens multi-canal
ALTER TABLE messages
  ADD COLUMN channel TEXT DEFAULT 'whatsapp',
  ADD COLUMN external_message_id TEXT,     -- ID genérico da mensagem externa
  ADD COLUMN message_type TEXT DEFAULT 'text', -- text, image, video, audio, file, story_reply, story_mention
  ADD COLUMN reply_to_id UUID REFERENCES messages(id), -- resposta a mensagem
  ADD COLUMN metadata JSONB DEFAULT '{}';  -- dados extras (story URL, reaction, etc.)

-- Migrar dados existentes
UPDATE messages SET
  channel = 'whatsapp',
  external_message_id = wa_message_id
WHERE wa_message_id IS NOT NULL;
```

#### Migration 3: Configuração Meta Business

```sql
-- Adicionar config Meta à organization_settings
ALTER TABLE organization_settings
  ADD COLUMN meta_config JSONB;
-- Estrutura esperada:
-- {
--   "appId": "123456789",
--   "appSecret": "••••••••",
--   "pageAccessToken": "••••••••",
--   "instagramAccountId": "17841400000000",
--   "facebookPageId": "100000000000000",
--   "webhookVerifyToken": "random-token-here",
--   "connectedChannels": ["instagram", "facebook"]
-- }
```

#### Migration 4: Tabela de Canais Conectados

```sql
-- Canais conectados por organização (para gerenciar múltiplas páginas/contas)
CREATE TABLE connected_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'facebook', 'email')),
  external_id TEXT NOT NULL,               -- ID externo (page ID, IG account ID, etc.)
  name TEXT NOT NULL,                       -- Nome da página/conta
  avatar_url TEXT,                          -- Foto do perfil
  access_token TEXT,                        -- Token de acesso (criptografado)
  config JSONB DEFAULT '{}',               -- Config adicional
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,                  -- Quando o token expira
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (organization_id, channel, external_id)
);

ALTER TABLE connected_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON connected_channels
  USING (organization_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON connected_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 4. API Routes

### 4.1 Novos Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| **Webhooks** | | |
| POST | `/api/webhooks/meta` | Receber eventos da Meta (IG + FB) |
| GET | `/api/webhooks/meta` | Verificação do webhook (challenge) |
| **Mensagens** | | |
| POST | `/api/messages/send` | Enviar mensagem (roteamento por canal) |
| **Canais** | | |
| GET | `/api/channels` | Listar canais conectados |
| POST | `/api/channels/connect/meta` | Iniciar conexão com Meta (OAuth) |
| DELETE | `/api/channels/[id]` | Desconectar canal |
| POST | `/api/channels/[id]/refresh-token` | Renovar token de acesso |
| **Conversas (alteração)** | | |
| GET | `/api/conversations` | Filtrar por canal (query: `?channel=instagram`) |
| GET | `/api/deals/[id]/conversations` | **NOVO** — Conversas de um deal |

### 4.2 Webhook Meta — Detalhamento

```typescript
// app/api/webhooks/meta/route.ts

// GET — Verificação do webhook
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

// POST — Receber mensagens
export async function POST(req: Request) {
  const body = await req.json()

  // Instagram Message
  if (body.object === 'instagram') {
    for (const entry of body.entry) {
      for (const messaging of entry.messaging) {
        await handleInstagramMessage(messaging)
      }
    }
  }

  // Facebook Messenger
  if (body.object === 'page') {
    for (const entry of body.entry) {
      for (const messaging of entry.messaging) {
        await handleFacebookMessage(messaging)
      }
    }
  }

  return new Response('OK', { status: 200 })
}
```

### 4.3 Router de Envio — Detalhamento

```typescript
// lib/communication/message-router.ts

interface SendMessageParams {
  conversationId: string
  body: string
  channel: 'whatsapp' | 'instagram' | 'facebook'
  mediaUrl?: string
  replyToId?: string
}

export async function sendMessage(params: SendMessageParams) {
  switch (params.channel) {
    case 'whatsapp':
      return sendWahaMessage(params)  // já existe
    case 'instagram':
      return sendInstagramMessage(params)
    case 'facebook':
      return sendFacebookMessage(params)
  }
}

async function sendInstagramMessage(params: SendMessageParams) {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/me/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: params.body }
      })
    }
  )
  return response.json()
}
```

---

## 5. Componentes & Telas

### 5.1 Aba "Conversas" no Deal Card (PRINCIPAL)

Essa é a mudança mais importante. No card do deal, ao lado de Timeline, Produtos e IA Insights, aparece uma nova aba **"Conversas"**.

```
┌─────────────────────────────────────────────────────────────┐
│  Contrato Anual - Acme                    GANHO  PERDIDO    │
│  $12.000                                                     │
│  ● Novos Leads → Contatado → Qualificando → Qualificado    │
├────────────────────┬────────────────────────────────────────┤
│  EMPRESA           │  Timeline | Produtos | Conversas | IA  │
│  Empresa Ltd       ├────────────────────────────────────────┤
│                    │  ┌─────────────────────────────────┐   │
│  CONTATO PRINCIPAL │  │ 📱 WhatsApp  📷 Instagram  💬 FB │   │
│  João Silva        │  ├─────────────────────────────────┤   │
│  Lead              │  │                                  │   │
│                    │  │  João (WhatsApp) - 14:30         │   │
│  DETALHES          │  │  "Oi, recebi a proposta!"        │   │
│  Prioridade: Média │  │                                  │   │
│  Criado: 17/03     │  │  Você (WhatsApp) - 14:32         │   │
│  Prob: 10%         │  │  "Ótimo! Alguma dúvida?"         │   │
│                    │  │                                  │   │
│  TAGS              │  │  João (Instagram) - 15:10        │   │
│  Novo              │  │  "Vi vocês no Instagram, quero   │   │
│                    │  │   saber mais sobre o produto X"  │   │
│                    │  │                                  │   │
│                    │  ├─────────────────────────────────┤   │
│                    │  │ [📎] Digite sua mensagem... [▶] │   │
│                    │  │ Canal: WhatsApp ▼                │   │
│                    │  └─────────────────────────────────┘   │
└────────────────────┴────────────────────────────────────────┘
```

**Comportamento:**
- Mostra timeline unificada de TODAS as conversas do contato/deal
- Cada mensagem tem badge do canal (WhatsApp verde, Instagram roxo, Facebook azul)
- Input de mensagem com seletor de canal
- Canal padrão = último canal usado pelo lead
- Filtro por canal (ver só WhatsApp, só Instagram, etc.)
- Suporta mídia (imagens, vídeos, áudios)

### 5.2 Inbox Omnichannel (Reformulação)

A aba "Conversas" da Inbox passa a ser omnichannel:

```
┌──────────────────────────────────────────────────────────┐
│  Inbox > Conversas                                        │
├──────────────┬───────────────────────────────────────────┤
│  🔍 Buscar   │                                           │
│              │  João Silva — Contrato Acme               │
│  FILTROS     │  ────────────────────────────────────      │
│  ☑ WhatsApp  │                                           │
│  ☑ Instagram │  📱 João (14:30): Recebi a proposta!      │
│  ☑ Facebook  │  👤 Você (14:32): Ótimo! Alguma dúvida?  │
│              │  📷 João (15:10): Vi vocês no Instagram   │
│  CONVERSAS   │                                           │
│  ┌──────────┐│                                           │
│  │📱 João S.││                                           │
│  │Contrato  ││                                           │
│  │15:10 ●2  ││                                           │
│  ├──────────┤│  ┌─────────────────────────────────────┐  │
│  │📷 Maria  ││  │ [📎] Mensagem...    Canal: WA ▼ [▶]│  │
│  │Proposta  ││  └─────────────────────────────────────┘  │
│  │14:50     ││                                           │
│  ├──────────┤│                                           │
│  │💬 Pedro  ││                                           │
│  │Reunião   ││                                           │
│  │13:20     ││                                           │
│  └──────────┘│                                           │
└──────────────┴───────────────────────────────────────────┘
```

### 5.3 Configurações — Canais Conectados

Nova seção na tela de Comunicação:

```
┌──────────────────────────────────────────────────────────┐
│  Configurações > Comunicação                              │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  📱 WhatsApp (WAHA)                    ● Conectado  │ │
│  │  Sessão: default | Status: WORKING                   │ │
│  │  [Gerenciar] [Desconectar]                           │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  📷 Instagram                          ○ Desconectado│ │
│  │  Conecte sua conta do Instagram Business             │ │
│  │  [Conectar com Meta Business]                        │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  💬 Facebook Messenger                 ○ Desconectado│ │
│  │  Conecte sua página do Facebook                      │ │
│  │  [Conectar com Meta Business]                        │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  ✉️ E-mail (SMTP)                      ○ Configurar  │ │
│  │  [Configurar SMTP]                                   │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 6. Estrutura de Arquivos (Novos)

```
features/
├── conversations/                    # NOVA feature principal
│   ├── index.ts
│   ├── types.ts                      # ConversationWithContact, Message, Channel
│   ├── components/
│   │   ├── DealConversationsTab.tsx   # Aba no deal card
│   │   ├── ConversationThread.tsx     # Thread de mensagens
│   │   ├── MessageBubble.tsx          # Bolha de mensagem com badge de canal
│   │   ├── MessageInput.tsx           # Input + seletor de canal
│   │   ├── ChannelBadge.tsx           # Badge visual do canal
│   │   ├── ChannelFilter.tsx          # Filtro por canal
│   │   └── MediaPreview.tsx           # Preview de mídia
│   ├── hooks/
│   │   ├── useDealConversations.ts    # Conversas de um deal
│   │   ├── useSendMessage.ts          # Envio multi-canal
│   │   └── useChannelStatus.ts        # Status dos canais
│   └── actions/
│       └── conversation-actions.ts    # Server actions

├── channels/                         # NOVA feature de canais
│   ├── index.ts
│   ├── types.ts
│   ├── components/
│   │   ├── ChannelsList.tsx           # Lista de canais conectados
│   │   ├── MetaConnectButton.tsx      # OAuth com Meta Business
│   │   ├── ChannelStatusCard.tsx      # Card de status do canal
│   │   └── TokenRefreshAlert.tsx      # Alerta de token expirando
│   ├── hooks/
│   │   └── useChannels.ts
│   └── actions/
│       └── channel-actions.ts

lib/
├── communication/
│   ├── waha.ts                       # Já existe — WhatsApp
│   ├── meta-instagram.ts             # NOVO — Instagram DM API
│   ├── meta-facebook.ts              # NOVO — Facebook Messenger API
│   ├── meta-auth.ts                  # NOVO — OAuth e token management
│   └── message-router.ts             # NOVO — Router multi-canal

app/api/
├── webhooks/
│   ├── waha/route.ts                 # Já existe
│   └── meta/route.ts                 # NOVO — Webhook unificado Meta
├── channels/
│   ├── route.ts                      # NOVO — CRUD canais
│   ├── connect/
│   │   └── meta/route.ts             # NOVO — OAuth Meta
│   └── [id]/
│       ├── route.ts                  # NOVO — Gerenciar canal
│       └── refresh-token/route.ts    # NOVO — Renovar token
├── messages/
│   └── send/route.ts                 # NOVO — Envio unificado
└── deals/
    └── [id]/
        └── conversations/route.ts    # NOVO — Conversas do deal
```

---

## 7. Fases de Implementação

### Fase 1: Infraestrutura Omnichannel (1-2 semanas)
**Objetivo:** Preparar o terreno — banco de dados, abstração de canais, router de mensagens.

- [ ] Migrations de banco (conversations expandido, messages expandido, connected_channels)
- [ ] Criar `message-router.ts` — abstração de envio multi-canal
- [ ] Criar tabela `connected_channels` com RLS
- [ ] Refatorar webhook WAHA para usar novo padrão de messages
- [ ] Testes unitários da camada de abstração

**Risco:** Baixo — são mudanças incrementais no banco.

### Fase 2: Aba Conversas no Deal Card (1-2 semanas)
**Objetivo:** A feature principal — conversar com o lead de dentro do card.

- [ ] Criar endpoint `GET /api/deals/[id]/conversations`
- [ ] Criar componente `DealConversationsTab`
- [ ] Criar componente `ConversationThread` (timeline unificada)
- [ ] Criar componente `MessageBubble` com badges de canal
- [ ] Criar componente `MessageInput` com seletor de canal
- [ ] Adicionar aba "Conversas" no deal card (ao lado de Timeline, Produtos, IA)
- [ ] Suporte a Realtime (mensagens aparecem ao vivo)
- [ ] Testes de componentes

**Risco:** Médio — precisa de boa UX para não poluir o card.

### Fase 3: Integração Meta (Instagram + Facebook) (2-3 semanas)
**Objetivo:** Conectar Instagram DM e Facebook Messenger.

- [ ] Criar app no Meta Business (manual, fora do código)
- [ ] Implementar OAuth flow (`meta-auth.ts`)
- [ ] Criar webhook handler unificado (`/api/webhooks/meta`)
- [ ] Implementar `meta-instagram.ts` — envio e recebimento
- [ ] Implementar `meta-facebook.ts` — envio e recebimento
- [ ] Tela de configuração de canais (Conectar com Meta)
- [ ] Gerenciamento de tokens (renovação automática)
- [ ] Matching de contato (vincular IG/FB user ao contato existente)
- [ ] App Review na Meta (submissão)
- [ ] Testes de integração

**Risco:** Alto — depende de aprovação da Meta e complexidade do OAuth.

### Fase 4: Inbox Unificada (1 semana)
**Objetivo:** Reformular a Inbox para ser omnichannel.

- [ ] Refatorar `InboxConversationsView` para mostrar todos os canais
- [ ] Adicionar filtros por canal
- [ ] Unificar contagem de não-lidas (todos os canais)
- [ ] Badge de canal na lista de conversas
- [ ] Busca cross-channel

**Risco:** Baixo — é refatoração de UI sobre infraestrutura já pronta.

### Fase 5: Polimento & Automação (1 semana)
**Objetivo:** Automação e refinamento.

- [ ] Auto-criação de deal quando mensagem chega de contato novo
- [ ] Automações para Instagram e Facebook (como já existe para WhatsApp)
- [ ] Notificações de nova mensagem (push/bell)
- [ ] Templates de resposta rápida multi-canal
- [ ] Analytics por canal (qual converte mais?)
- [ ] Documentação

**Risco:** Baixo — são melhorias incrementais.

---

## 8. Estimativa Total

| Fase | Esforço | Complexidade |
|------|---------|-------------|
| 1 — Infraestrutura | 1-2 semanas | Média |
| 2 — Deal Card Conversas | 1-2 semanas | Média-Alta |
| 3 — Meta Integration | 2-3 semanas | Alta |
| 4 — Inbox Unificada | 1 semana | Baixa |
| 5 — Polimento | 1 semana | Baixa |
| **Total** | **6-9 semanas** | **—** |

---

## 9. Pré-requisitos

### Técnicos
- Conta no Meta Business Suite
- App criado em developers.facebook.com
- Conta Instagram Business (não pessoal) conectada à página do Facebook
- Domínio verificado no Meta Business (para webhook)
- SSL no webhook endpoint (Vercel já fornece)

### Decisões Pendentes
1. **WAHA ou Cloud API?** — Manter WAHA (gratuito) ou migrar para Cloud API oficial? Recomendação: manter WAHA agora, migrar depois.
2. **Unificação de contato** — Quando alguém fala pelo Instagram e não tem telefone cadastrado, criar novo contato ou tentar match por nome/email?
3. **Atribuição automática** — Mensagem nova sem deal: criar deal automaticamente em qual board?
4. **Rate limits** — Meta limita 200 chamadas/hora por app para messaging. É suficiente?

---

## 10. Comparativo com Concorrentes

### 10.1 Tabela Comparativa de Features

| Feature | NossoCRM (Futuro) | Salesforce | Kommo | RD Station | HubSpot |
|---------|-------------------|------------|-------|------------|---------|
| WhatsApp nativo | ✅ (WAHA) | Add-on ($75/user) | ✅ | ❌ | Plugin |
| Instagram DM | ✅ | Add-on ($75/user) | ✅ | ❌ | Plugin |
| Facebook Messenger | ✅ | Add-on ($75/user) | ✅ | ❌ | Plugin |
| Conversa dentro do deal | ✅ | ✅ (Service Console) | ✅ | ❌ | ✅ |
| Timeline unificada | ✅ | ✅ | ✅ | ❌ | ✅ |
| Self-hosted WhatsApp | ✅ (custo $0/msg) | ❌ | ❌ | ❌ | ❌ |
| IA nativa integrada | ✅ (multi-provider) | ✅ (Einstein) | ❌ | ❌ | ✅ |
| Automação por canal | ✅ | ✅ (Flow Builder) | ✅ | Parcial | ✅ |
| Bring Your Own Channel | Futuro | ✅ | ❌ | ❌ | ❌ |
| API aberta / Webhooks | ✅ | ✅ | ✅ | ✅ | ✅ |
| Setup em minutos | ✅ | ❌ (semanas) | ✅ | ✅ | Parcial |
| Multi-tenant nativo | ✅ | ✅ | ❌ | ❌ | ❌ |

### 10.2 NossoCRM vs Salesforce — Análise Detalhada

#### Salesforce: O Gigante

O Salesforce é a referência mundial em CRM, mas seu modelo omnichannel tem características importantes:

**Preço do Salesforce para Omnichannel:**

| Componente | Preço (USD/user/mês) |
|-----------|---------------------|
| Sales Cloud Starter | $25 |
| Sales Cloud Pro Suite | $100 |
| Sales Cloud Enterprise | $175 |
| Sales Cloud Unlimited | $350 |
| Agentforce (AI + tudo) | $550 |
| **Digital Engagement Add-on** | **+$75** |
| Implementação típica | $25.000+ (único) |

Para ter WhatsApp + Instagram + Facebook no Salesforce, o cliente precisa no mínimo do **Pro Suite ($100) + Digital Engagement ($75) = $175/user/mês**. Para uma equipe de 5 vendedores, são **$875/mês** ou **~R$ 5.250/mês** só em licenças, sem contar implementação.

**Onde o Salesforce ganha:**

- Ecossistema maduro com milhares de integrações (AppExchange)
- Agentforce Contact Center — IA de voz + chat + CRM unificado
- "Bring Your Own Channel" — integrar qualquer canal via API (Discord, KakaoTalk, TikTok)
- Relatórios e dashboards extremamente poderosos
- Compliance enterprise (HIPAA, SOC2, GDPR nativo)
- Escalabilidade para milhares de agentes
- Flow Builder visual para automações complexas

**Onde o NossoCRM ganha:**

- **Custo:** Plataforma própria, sem licença por usuário. WhatsApp via WAHA custa $0/mensagem
- **Simplicidade:** Setup em minutos, não semanas. Sem necessidade de consultoria de implementação
- **Foco no vendedor brasileiro:** Interface em PT-BR, integração com SERASA, base FLAG/SAP, funil de pré-venda adaptado ao mercado de distribuição
- **WhatsApp self-hosted:** Sem custo por mensagem, sem depender da Cloud API da Meta (Salesforce cobra via Digital Engagement)
- **IA multi-provider:** Pode usar Anthropic, Google ou OpenAI — configurável por organização. Salesforce só oferece Einstein (proprietário)
- **Conversa no deal card:** Experiência nativa, sem precisar de add-on de $75/user
- **Velocidade de evolução:** Stack moderna (Next.js 15, React 19, Supabase) vs infraestrutura legada do Salesforce
- **Sem vendor lock-in:** Código próprio, banco PostgreSQL, deploy onde quiser

#### Posicionamento Estratégico

```
                    COMPLEXIDADE DA OPERAÇÃO
                    Baixa ──────────────────── Alta
                    │                            │
          Baixo     │  ┌─────────┐               │
                    │  │ RD      │               │
                    │  │ Station │               │
          PREÇO     │  └─────────┘               │
                    │                            │
                    │  ┌──────────┐  ┌────────┐  │
                    │  │ NossoCRM │  │ Kommo  │  │
                    │  │ ★        │  │        │  │
                    │  └──────────┘  └────────┘  │
                    │                            │
                    │               ┌──────────┐ │
          Alto      │               │ HubSpot  │ │
                    │               └──────────┘ │
                    │                            │
                    │           ┌──────────────┐ │
                    │           │ Salesforce   │ │
                    │           └──────────────┘ │
                    │                            │
```

O NossoCRM se posiciona no **sweet spot**: funcionalidades omnichannel comparáveis ao Salesforce (após a implementação), com custo e complexidade próximos ao RD Station. É ideal para equipes comerciais de **5 a 50 vendedores** em empresas de distribuição e B2B, que não precisam da complexidade enterprise do Salesforce mas querem mais que o RD Station oferece.

### 10.3 Funcionalidades Exclusivas do NossoCRM

Algumas coisas que **nenhum** dos concorrentes oferece na mesma combinação:

1. **WhatsApp $0/mensagem** — Todos os concorrentes cobram por mensagem ou exigem add-on pago
2. **IA com sugestões proativas** — Detecção automática de deals parados, upsell e risco de churn, com recomendações no inbox
3. **Integração SERASA/FLAG/SAP nativa** — Verificação de crédito e base de clientes integrada ao funil de qualificação
4. **Automação de qualificação** — Motor de automação que move deals no funil baseado em resposta do lead (já funciona com WhatsApp, será estendido para IG/FB)
5. **Agente IA multi-provider** — Escolher entre Claude, Gemini ou GPT por organização, sem ficar preso a um fornecedor

---

---

# MÓDULO 2: Gerador de Landing Pages com IA

---

## 12. Visão Geral — Landing Page Builder

Adicionar ao NossoCRM um gerador de landing pages com qualidade equivalente ao Lovable, mas **integrado nativamente ao CRM**. O vendedor descreve a campanha, a IA gera a landing page completa, e os leads capturados entram direto no pipeline.

### O Ciclo Completo

```
┌───────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Vendedor  │────>│ IA gera      │────>│ Landing page │────>│ Lead entra   │
│ descreve  │     │ landing page │     │ publicada    │     │ no pipeline  │
│ campanha  │     │ completa     │     │ (subdomínio) │     │ do NossoCRM  │
└───────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### Por Que Isso é Poderoso

Hoje o fluxo é: **Lovable (gerar) → Deploy manual → Webhook/Form → NossoCRM (receber lead)**. São 4 ferramentas desconectadas.

Com o builder integrado: **NossoCRM (descrever → gerar → publicar → capturar)**. Tudo numa tela só.

Nenhum CRM no Brasil oferece isso com qualidade de IA generativa.

### Comparativo

| Feature | NossoCRM Builder | Lovable | RD Station | Unbounce |
|---------|-----------------|---------|------------|----------|
| IA gera do zero | ✅ (Claude/Gemini/GPT) | ✅ | ❌ | ❌ |
| Qualidade visual | Alta (Tailwind + shadcn) | Alta | Média | Alta |
| Integração CRM | ✅ Nativa (mesmo sistema) | ❌ (precisa webhook) | ✅ (próprio) | ❌ (precisa integrar) |
| Lead cai no pipeline | Automático | Manual | Automático | Manual |
| Editor visual drag-drop | Futuro (v2) | ✅ | ✅ | ✅ |
| Custom domain | Futuro | ✅ | ✅ | ✅ |
| Templates prontos | ✅ | ✅ | ✅ | ✅ |
| Preço | Incluído no CRM | $20-100/mês | $$$$ | $$$ |
| A/B Testing | Futuro | ❌ | ✅ | ✅ |

---

## 13. Arquitetura Técnica

### 13.1 Como Funciona

O Lovable usa React + Tailwind + shadcn/ui com um sistema multi-agente de IA. Podemos replicar essa qualidade com uma abordagem mais simples e eficiente:

**Abordagem: HTML Standalone com Tailwind CDN**

Cada landing page é um **único arquivo HTML** auto-contido que inclui:
- Tailwind CSS via CDN (sem build step)
- Fontes do Google Fonts
- Imagens de stock (Unsplash/Pexels)
- Formulário de captura que envia direto para a API do NossoCRM
- Analytics básico (Google Analytics / Meta Pixel opcionais)
- SEO meta tags
- Mobile-responsive por padrão

**Por que HTML puro e não React?**
- Não precisa de build step (Next.js, Vite, etc.)
- Pode ser servido como página estática (rápido e barato)
- A IA gera com qualidade excelente
- SEO melhor (HTML semântico renderizado no servidor)
- Mais simples de hospedar e cachear

### 13.2 Fluxo de Geração

```
┌─────────────────────────────────────────────────────────┐
│                    NossoCRM UI                            │
│                                                           │
│  1. PROMPT                                               │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ "Landing page para venda de produto X da Chok       │ │
│  │  Distribuidora. Foco em distribuidores de alimentos │ │
│  │  no interior de SP. Tons de verde e branco."        │ │
│  └─────────────────────────────────────────────────────┘ │
│                          │                                │
│                          ▼                                │
│  2. IA PROCESSA (AI SDK — Claude/Gemini/GPT)             │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ System Prompt com:                                   │ │
│  │ - Padrões de design (hero, features, social proof)  │ │
│  │ - Tailwind CSS classes                               │ │
│  │ - Formulário pré-configurado com action=NossoCRM    │ │
│  │ - Boas práticas de conversão                        │ │
│  │ - Dados da organização (logo, cores, nome)          │ │
│  └─────────────────────────────────────────────────────┘ │
│                          │                                │
│                          ▼                                │
│  3. PREVIEW                                              │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  [Preview da landing page gerada]                    │ │
│  │  ┌───────────────────────────────────────┐          │ │
│  │  │         Hero com CTA                   │          │ │
│  │  │    Features / Benefícios               │          │ │
│  │  │    Social Proof / Depoimentos          │          │ │
│  │  │    Formulário de Captura               │          │ │
│  │  │    Footer                              │          │ │
│  │  └───────────────────────────────────────┘          │ │
│  │                                                      │ │
│  │  [🔄 Regenerar] [✏️ Ajustar com IA] [✅ Publicar]   │ │
│  └─────────────────────────────────────────────────────┘ │
│                          │                                │
│                          ▼                                │
│  4. PUBLICAÇÃO                                           │
│  URL: pages.gacrm.vercel.app/chok-produto-x             │
│  Board de destino: Pré-venda ▼                           │
│  Estágio inicial: Novos Leads ▼                          │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### 13.3 Hospedagem

As landing pages são servidas como **páginas estáticas no Vercel** (mesmo deploy do NossoCRM):

```
app/
└── (pages)/
    └── p/
        └── [slug]/
            └── page.tsx    # Renderiza o HTML da landing page
```

**Rota:** `gacrm.vercel.app/p/nome-da-campanha`

O HTML é armazenado no Supabase (tabela `landing_pages`) e servido via uma rota dinâmica do Next.js com ISR (Incremental Static Regeneration) para performance máxima.

### 13.4 Captura de Leads — O Diferencial

O formulário gerado na landing page envia os dados **diretamente para a API de webhooks do NossoCRM** que já existe:

```html
<!-- Formulário gerado pela IA — já integrado ao CRM -->
<form id="lead-form" class="space-y-4">
  <input type="text" name="name" placeholder="Seu nome" required
         class="w-full px-4 py-3 rounded-lg border border-gray-300" />
  <input type="email" name="email" placeholder="Seu e-mail" required
         class="w-full px-4 py-3 rounded-lg border border-gray-300" />
  <input type="tel" name="phone" placeholder="WhatsApp" required
         class="w-full px-4 py-3 rounded-lg border border-gray-300" />
  <button type="submit"
          class="w-full bg-green-600 text-white py-3 rounded-lg font-bold">
    Quero saber mais
  </button>
</form>

<script>
document.getElementById('lead-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  await fetch('https://gacrm.vercel.app/api/webhooks/inbound', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'LP_API_KEY_HERE'
    },
    body: JSON.stringify({
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      source: 'landing-page',
      landing_page_id: 'LP_ID_HERE',
      board_id: 'BOARD_ID_HERE',
      stage_id: 'STAGE_ID_HERE'
    })
  });
  // Redirect ou mostrar mensagem de sucesso
  window.location.href = '/p/LP_SLUG/obrigado';
});
</script>
```

O webhook já cria o contato e o deal automaticamente no pipeline correto.

---

## 14. Modelo de Dados — Landing Pages

### Migration: Tabela de Landing Pages

```sql
CREATE TABLE landing_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Identificação
  title TEXT NOT NULL,                     -- "Campanha Produto X"
  slug TEXT NOT NULL,                       -- "chok-produto-x"
  description TEXT,                         -- Descrição interna

  -- Conteúdo
  html_content TEXT NOT NULL,              -- HTML completo gerado pela IA
  prompt_used TEXT,                         -- Prompt original do usuário
  ai_model TEXT,                           -- Modelo usado (claude, gemini, gpt)

  -- Configuração de captura
  target_board_id UUID REFERENCES boards(id),  -- Board de destino
  target_stage_id UUID,                    -- Estágio inicial do deal
  webhook_api_key TEXT NOT NULL,           -- Chave de API para o formulário
  custom_fields JSONB DEFAULT '{}',        -- Campos extras do formulário
  thank_you_message TEXT DEFAULT 'Obrigado! Entraremos em contato em breve.',
  thank_you_redirect_url TEXT,             -- URL de redirecionamento pós-envio

  -- SEO & Meta
  meta_title TEXT,
  meta_description TEXT,
  og_image_url TEXT,                       -- Open Graph image
  favicon_url TEXT,

  -- Tracking
  google_analytics_id TEXT,                -- GA4 ID
  meta_pixel_id TEXT,                      -- Facebook/Meta Pixel

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,

  -- Métricas (desnormalizadas para performance)
  views_count INTEGER DEFAULT 0,
  submissions_count INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),

  UNIQUE (organization_id, slug)
);

ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON landing_pages
  USING (organization_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Índice para busca por slug (rota pública)
CREATE INDEX idx_landing_pages_slug
  ON landing_pages(slug, status)
  WHERE status = 'published';

-- Tabela de submissões (analytics detalhado)
CREATE TABLE landing_page_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  landing_page_id UUID NOT NULL REFERENCES landing_pages(id),
  contact_id UUID REFERENCES contacts(id),
  deal_id UUID REFERENCES deals(id),
  form_data JSONB NOT NULL,               -- Dados brutos do formulário
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

CREATE POLICY "org_isolation" ON landing_page_submissions
  USING (organization_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Trigger para atualizar métricas
CREATE OR REPLACE FUNCTION update_landing_page_metrics()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE landing_pages SET
    submissions_count = submissions_count + 1,
    conversion_rate = CASE
      WHEN views_count > 0
      THEN ROUND(((submissions_count + 1)::NUMERIC / views_count) * 100, 2)
      ELSE 0
    END,
    updated_at = NOW()
  WHERE id = NEW.landing_page_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_submission_update_metrics
  AFTER INSERT ON landing_page_submissions
  FOR EACH ROW EXECUTE FUNCTION update_landing_page_metrics();
```

---

## 15. API Routes — Landing Pages

| Método | Rota | Descrição |
|--------|------|-----------|
| **CRUD** | | |
| GET | `/api/landing-pages` | Listar landing pages da org |
| POST | `/api/landing-pages` | Criar nova (salva draft) |
| GET | `/api/landing-pages/[id]` | Detalhes da landing page |
| PATCH | `/api/landing-pages/[id]` | Atualizar (título, config, HTML) |
| DELETE | `/api/landing-pages/[id]` | Arquivar landing page |
| **Geração IA** | | |
| POST | `/api/landing-pages/generate` | Gerar HTML com IA a partir do prompt |
| POST | `/api/landing-pages/[id]/regenerate` | Regenerar com novo prompt/ajuste |
| **Publicação** | | |
| POST | `/api/landing-pages/[id]/publish` | Publicar (status → published) |
| POST | `/api/landing-pages/[id]/unpublish` | Despublicar |
| **Captura** | | |
| POST | `/api/p/[slug]/submit` | Receber submissão do formulário (pública) |
| GET | `/api/p/[slug]/track` | Registrar pageview (pixel 1x1) |
| **Analytics** | | |
| GET | `/api/landing-pages/[id]/analytics` | Métricas: views, submissões, conversão |
| GET | `/api/landing-pages/[id]/submissions` | Lista de submissões |

---

## 16. Componentes — Landing Page Builder

### Estrutura de Arquivos

```
features/
└── landing-pages/
    ├── index.ts
    ├── types.ts
    ├── components/
    │   ├── LandingPagesList.tsx        # Lista de landing pages (cards)
    │   ├── LandingPageBuilder.tsx      # Tela principal do builder
    │   ├── PromptInput.tsx             # Input de prompt com sugestões
    │   ├── LivePreview.tsx             # Preview em iframe da página gerada
    │   ├── PublishDialog.tsx           # Modal de publicação (slug, board, etc.)
    │   ├── LandingPageAnalytics.tsx    # Dashboard de métricas
    │   ├── SubmissionsList.tsx         # Lista de leads capturados
    │   └── TemplateGallery.tsx         # Galeria de templates para inspiração
    ├── hooks/
    │   ├── useLandingPages.ts          # CRUD hooks
    │   ├── useGeneratePage.ts          # Hook de geração com IA (streaming)
    │   └── useLandingPageAnalytics.ts  # Hook de métricas
    ├── actions/
    │   └── landing-page-actions.ts
    └── lib/
        ├── page-generator.ts           # System prompts e lógica de geração
        ├── templates.ts                # Templates base
        └── slug-utils.ts              # Geração/validação de slugs

app/
├── (protected)/
│   └── landing-pages/
│       ├── page.tsx                    # Lista de landing pages
│       └── [id]/
│           ├── page.tsx                # Builder/Editor
│           └── analytics/page.tsx      # Analytics da página
└── (pages)/
    └── p/
        └── [slug]/
            ├── page.tsx                # Renderiza a landing page (público)
            └── obrigado/page.tsx       # Página de obrigado
```

### 16.1 Tela do Builder

```
┌──────────────────────────────────────────────────────────────┐
│  ← Landing Pages    Campanha Produto X              [Status: │
│                                                      Draft]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Descreva sua landing page:                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Landing page para promoção de Páscoa da Chok           │  │
│  │ Distribuidora. Destaque para chocolates artesanais.    │  │
│  │ Cores: marrom, dourado e branco. Incluir depoimentos   │  │
│  │ de clientes e seção de produtos em destaque.           │  │
│  └────────────────────────────────────────────────────────┘  │
│  [🎨 Gerar Landing Page]  [📋 Usar Template]                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                         │  │
│  │              ┌─────────────────────┐                    │  │
│  │              │   PREVIEW IFRAME    │                    │  │
│  │              │                     │                    │  │
│  │              │  🍫 Páscoa Chok     │                    │  │
│  │              │  Chocolates que     │                    │  │
│  │              │  encantam...        │                    │  │
│  │              │                     │                    │  │
│  │              │  [Formulário]       │                    │  │
│  │              │                     │                    │  │
│  │              └─────────────────────┘                    │  │
│  │                                                         │  │
│  │  [📱 Mobile] [💻 Desktop]                              │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Ajustar:                                                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ "Mude a cor do botão para verde e adicione um          │  │
│  │  contador regressivo para a promoção"                  │  │
│  └────────────────────────────────────────────────────────┘  │
│  [🔄 Aplicar Ajuste]                                        │
│                                                              │
│  ┌──────────────────────┐  ┌───────────────────────────┐   │
│  │ CONFIGURAÇÃO          │  │ CAPTURA DE LEADS           │   │
│  │ Slug: pascoa-chok     │  │ Board: Pré-venda ▼        │   │
│  │ Meta Title: ...       │  │ Estágio: Novos Leads ▼    │   │
│  │ GA4 ID: G-XXXXX       │  │ Campos: Nome, Email,      │   │
│  │ Meta Pixel: ...       │  │   WhatsApp, Empresa       │   │
│  └──────────────────────┘  └───────────────────────────┘   │
│                                                              │
│  [🔄 Regenerar]  [✅ Publicar]  [📊 Analytics]             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 17. System Prompt para Geração

O segredo da qualidade está no system prompt. Aqui está o rascunho:

```
Você é um especialista em design de landing pages de alta conversão.
Gere uma landing page COMPLETA em HTML puro com Tailwind CSS via CDN.

REGRAS OBRIGATÓRIAS:
1. O HTML deve ser auto-contido (um único arquivo)
2. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
3. Google Fonts para tipografia profissional
4. Mobile-first e 100% responsivo
5. Imagens de stock do Unsplash (URLs diretas)
6. Paleta de cores consistente baseada na marca
7. Formulário de captura pré-configurado com os campos solicitados
8. Seções obrigatórias:
   - Hero com headline impactante e CTA
   - Benefícios/Features (3-6 itens com ícones)
   - Social proof (depoimentos ou logos de clientes)
   - Formulário de captura
   - Footer com informações legais
9. Microinterações com CSS (hover states, transitions)
10. Meta tags para SEO e Open Graph
11. Schema.org markup quando relevante
12. Performance: lazy loading em imagens, font-display: swap
13. Acessibilidade: alt texts, labels, contraste adequado

DADOS DA ORGANIZAÇÃO:
- Nome: {{orgName}}
- Logo: {{logoUrl}}
- Cores da marca: {{brandColors}}

FORMULÁRIO DE CAPTURA:
O form deve enviar para: {{webhookUrl}}
Com os campos: {{formFields}}
API Key no header: {{apiKey}}

ESTILO VISUAL:
Moderno, clean, profissional. Inspirado em landing pages de SaaS de alta qualidade.
Use gradients sutis, sombras suaves, bordas arredondadas.
Evite parecer genérico — cada página deve parecer feita sob medida.
```

---

## 18. Fases de Implementação — Landing Pages

### Fase LP-1: MVP do Builder (2-3 semanas)
**Objetivo:** Vendedor descreve → IA gera → Publica → Captura leads.

- [ ] Migration de banco (landing_pages, landing_page_submissions)
- [ ] Endpoint de geração com AI SDK (`/api/landing-pages/generate`)
- [ ] System prompt otimizado para qualidade Lovable
- [ ] Componente `LandingPageBuilder` com prompt input
- [ ] Componente `LivePreview` com iframe
- [ ] Rota pública `/p/[slug]` para servir a página
- [ ] Endpoint de captura `/api/p/[slug]/submit`
- [ ] Integração automática com pipeline (criar contato + deal)
- [ ] Página de "Obrigado" customizável
- [ ] Tela de listagem de landing pages

### Fase LP-2: Templates & Polimento (1-2 semanas)
**Objetivo:** Galeria de templates e ajustes iterativos.

- [ ] 10-15 templates base (distribuição, B2B, eventos, produtos)
- [ ] Galeria visual de templates
- [ ] Funcionalidade "Ajustar com IA" (prompt incremental)
- [ ] Regeneração com variações
- [ ] Preview mobile/desktop toggle
- [ ] SEO meta tags editáveis
- [ ] Integração Google Analytics e Meta Pixel

### Fase LP-3: Analytics & Otimização (1 semana)
**Objetivo:** Medir e otimizar conversão.

- [ ] Tracking de pageviews
- [ ] Dashboard de analytics por landing page
- [ ] Lista de submissões com dados do lead
- [ ] Métricas: views, conversão, UTM tracking
- [ ] Link direto para o deal/contato gerado

### Estimativa Total

| Fase | Esforço | Complexidade |
|------|---------|-------------|
| LP-1 — MVP Builder | 2-3 semanas | Média-Alta |
| LP-2 — Templates | 1-2 semanas | Média |
| LP-3 — Analytics | 1 semana | Baixa |
| **Total** | **4-6 semanas** | **—** |

---

## 19. Comparativo Atualizado (com Landing Pages)

| Feature | NossoCRM (Futuro) | Salesforce | Kommo | RD Station | HubSpot |
|---------|-------------------|------------|-------|------------|---------|
| Omnichannel (WA+IG+FB) | ✅ | Add-on ($75/user) | ✅ | ❌ | Plugin |
| Conversa no deal card | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Landing Page Builder** | **✅ (IA)** | **Pardot ($$$)** | **❌** | **✅ (drag-drop)** | **✅ (drag-drop)** |
| **IA gera landing page** | **✅** | **❌** | **❌** | **❌** | **❌** |
| Lead → Pipeline auto | ✅ | ✅ | Parcial | ✅ | ✅ |
| Analytics de LP | ✅ | ✅ | ❌ | ✅ | ✅ |
| Templates de LP | ✅ | ✅ | ❌ | ✅ | ✅ |
| Self-hosted WhatsApp | ✅ ($0/msg) | ❌ | ❌ | ❌ | ❌ |
| IA multi-provider | ✅ | Einstein only | ❌ | ❌ | ✅ |
| Preço | Próprio | $$$$$$ | $$$$ | $$$$ | $$$$ |

**Destaque:** O NossoCRM seria o **único CRM** a oferecer geração de landing pages com IA. RD Station e HubSpot têm builders drag-and-drop, mas nenhum gera a página completa a partir de um prompt de texto.

---

## 20. Conclusão Geral

Com as duas expansões (Omnichannel + Landing Page Builder), o NossoCRM se torna uma plataforma completa de vendas:

```
   CAPTURA              QUALIFICAÇÃO              CONVERSÃO
┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ Landing Page │───>│ Pipeline com     │───>│ Conversa         │
│ Builder (IA) │    │ Automação + IA   │    │ Omnichannel      │
│              │    │                  │    │ (WA + IG + FB)   │
│ Lead entra   │    │ IA sugere ações  │    │ Dentro do deal   │
│ automático   │    │ SERASA valida    │    │ card             │
└──────────────┘    └──────────────────┘    └──────────────────┘
```

O ciclo completo: **Gerar landing page → Capturar lead → Qualificar com IA → Conversar omnichannel → Fechar negócio**.

### Roadmap Consolidado

| Prioridade | Módulo | Esforço | Impacto |
|-----------|--------|---------|---------|
| 1 | Omnichannel — Infraestrutura + Deal Card | 2-4 sem | 🔥 Alto |
| 2 | Landing Page Builder — MVP | 2-3 sem | 🔥 Alto |
| 3 | Omnichannel — Meta Integration | 2-3 sem | 📋 Alto |
| 4 | Landing Pages — Templates + Analytics | 2-3 sem | ✨ Médio |
| 5 | Omnichannel — Inbox + Polimento | 2 sem | ✨ Médio |
| **Total** | | **10-15 semanas** | |

**Próximo passo recomendado:** Começar pelo Omnichannel (Fases 1-2) e Landing Page Builder MVP em paralelo, pois são independentes e juntos representam a maior transformação de valor do produto.
