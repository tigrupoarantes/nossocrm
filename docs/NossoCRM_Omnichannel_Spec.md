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

| Feature | NossoCRM (Futuro) | Kommo | RD Station | HubSpot |
|---------|-------------------|-------|------------|---------|
| WhatsApp no deal | ✅ | ✅ | ❌ | Plugin |
| Instagram DM | ✅ | ✅ | ❌ | Plugin |
| Facebook Messenger | ✅ | ✅ | ❌ | Plugin |
| Timeline unificada | ✅ | ✅ | ❌ | ✅ |
| Self-hosted WhatsApp | ✅ (WAHA) | ❌ | ❌ | ❌ |
| IA integrada | ✅ | ❌ | ❌ | ✅ |
| Preço | Próprio | $$$$ | $$$ | $$$$ |

---

## 11. Conclusão

Essa transformação posiciona o NossoCRM como uma plataforma competitiva com Kommo e outros CRMs omnichannel, mas com vantagens únicas: self-hosted WhatsApp (custo zero por mensagem), IA nativa para sugestões, e experiência focada no vendedor brasileiro.

A maior parte da infraestrutura de banco de dados já está preparada (conversations, messages, contact_channel_preferences). O trabalho principal é criar a camada de integração Meta, a aba de conversas no deal card, e refatorar a inbox para ser multi-canal.

**Próximo passo recomendado:** Começar pela Fase 1 (migrations e abstração) e Fase 2 (aba no deal card) em paralelo, já que não dependem da integração Meta para funcionar com WhatsApp.
