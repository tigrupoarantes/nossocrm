# Documentação Técnica (As-Is) — NossoCRM

**Data de referência:** 26/02/2026  
**Escopo:** estado atual implementado no repositório

---

## 1. Visão geral técnica

O NossoCRM é uma aplicação full-stack em **Next.js 16 (App Router)**, com frontend e backend no mesmo projeto, persistência no **Supabase (Auth + Postgres)** e camada de IA via **AI SDK v6**.

Pilares técnicos atuais:
- App Router com rotas protegidas em `app/(protected)`.
- Route Handlers em `app/api/*` para backend HTTP.
- Multi-tenant por `organization_id` em dados e ferramentas.
- Estado de dados com **TanStack Query** (providers + query keys).
- UI com React 19, TypeScript strict, Tailwind v4 e Radix.

---

## 2. Stack e runtime

### 2.1 Frontend
- **React 19.2.1**
- **Next.js 16.0.x**
- **TypeScript 5 (strict)**
- **Tailwind CSS v4**
- **Radix UI** (primitivos)

### 2.2 Backend
- **Next.js Route Handlers** (`app/api/*`)
- **Supabase** com clientes SSR/client/service-role (`lib/supabase/*`)
- **Postgres + RLS**

### 2.3 IA
- **AI SDK v6** (`ai` + providers Google/OpenAI/Anthropic)
- Agente CRM em `lib/ai/crmAgent.ts`
- Ferramentas de IA em `lib/ai/tools.ts`

### 2.4 Qualidade
- Lint: `npm run lint` (zero warnings)
- Typecheck: `npm run typecheck`
- Testes: `vitest` (`npm run test:run`)

---

## 3. Arquitetura da aplicação

### 3.1 Camadas
1. **UI e páginas**: `app/`, `components/`, `features/`
2. **Estado e contexto**: `context/`, `lib/query/`
3. **Serviços de domínio**: `lib/*` (AI, segurança, validação, fetch, etc.)
4. **Persistência/integrações**: Supabase, webhooks, API pública, MCP

### 3.2 Fluxo de proteção de rota
- Arquivo `proxy.ts` aplica refresh de sessão e controle de navegação.
- `proxy.ts` **não intercepta** `api/*` (intencional para não quebrar clientes HTTP).
- Autorização de APIs é feita nos próprios Route Handlers.

### 3.3 Composição do app protegido
No layout protegido (`app/(protected)/layout.tsx`), a aplicação compõe os providers na ordem:
- `QueryProvider`
- `ToastProvider`
- `ThemeProvider`
- `AuthProvider`
- `CRMProvider`
- `AIProvider`

---

## 4. Módulos funcionais (estado atual)

Rotas protegidas existentes em `app/(protected)`:
- `dashboard`
- `boards`
- `pipeline`
- `deals`
- `contacts`
- `activities`
- `inbox`
- `decisions`
- `reports`
- `profile`
- `settings`
- `setup`
- `ai`, `ai-test`, `labs`

Features organizadas em `features/`:
- `activities`, `ai-hub`, `boards`, `contacts`, `dashboard`, `deals`, `decisions`, `inbox`, `profile`, `reports`, `settings`

---

## 5. APIs e backend HTTP

### 5.1 Grupos principais de Route Handlers
Em `app/api` há grupos para:
- `ai/*` (chat, actions e tasks específicas)
- `mcp/*` (MCP remoto)
- `public/v1/*` (API pública)
- `installer/*` e `setup-instance/*` (instalação/bootstrap)
- `admin/*`, `settings/*`, `contacts/*`, `invites/*`, `chat/*`

### 5.2 API pública v1
Documentada em `docs/public-api.md` e OpenAPI em:
- `GET /api/public/v1/openapi.json`
- `GET /api/public/v1/docs`

Autenticação:
- `X-Api-Key: <api_key>`

Recursos principais:
- boards, companies, contacts, deals, activities, meta (`/me`)

### 5.3 Chat IA
Endpoint principal:
- `POST /api/ai/chat`

Comportamento técnico atual:
- validação de origem (`same-origin`) para mitigação CSRF;
- autenticação via usuário Supabase;
- resolução de contexto por organização;
- checagem de feature flag de IA;
- streaming de resposta via `createAgentUIStreamResponse`.

### 5.4 MCP Server
Endpoint:
- `GET/POST /api/mcp`

Autenticação:
- `Authorization: Bearer <API_KEY>` ou `X-Api-Key`

Funcionalidades:
- JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`)
- catálogo de tools derivado do CRM (`crm.*`)

---

## 6. Dados, tenancy e segurança

### 6.1 Multi-tenant
- Isolamento por `organization_id` como regra central.
- Ferramentas de IA e endpoints públicos operam no escopo da organização autenticada.

### 6.2 Supabase
Clientes em `lib/supabase/`:
- `client.ts` (browser)
- `server.ts` (SSR/route handlers)
- `staticAdminClient.ts` (operações administrativas controladas)
- `middleware.ts` (integração com proxy)

### 6.3 Segurança aplicada
- Guardas de autenticação por rota/API.
- Restrições de origem em endpoint sensível de chat.
- Segregação entre tráfego UI protegido e `/api/*`.

---

## 7. Integrações externas

### 7.1 Webhooks
Documentação em `docs/webhooks.md`.

- **Inbound**: entrada de leads via Supabase Functions (`webhook-in/<source_id>`)
- **Outbound**: eventos de mudança de estágio de deal
- Auditoria em tabelas de eventos e entregas

### 7.2 MCP
Documentação em `docs/mcp.md`.

- Exposição do CRM como servidor MCP remoto
- Ferramentas com schema de entrada em JSON Schema 2020-12

### 7.3 API pública
- Integração por API key
- Contrato versionado em `/api/public/v1/*`

---

## 8. Estado de qualidade e testes

Base de testes em `test/` cobrindo temas críticos já identificados no projeto:
- RBAC e multi-tenant em tools de IA
- middleware/auth
- API pública (cursor/OpenAPI)

Padrão de execução atual:
- `npm run precheck` para validações completas
- `npm run precheck:fast` para fluxo rápido local

---

## 9. Riscos técnicos atuais (as-is)

1. **Ambientes Vercel**: necessidade de manter consistência de variáveis entre produção/preview/development.
2. **Complexidade de integrações IA**: governança de providers/modelos/chaves por organização.
3. **Operação de webhooks**: ausência de retry/backoff nativo em parte do fluxo outbound (MVP).

---

## 10. Referências internas

- `README.md`
- `AGENTS.md`
- `docs/public-api.md`
- `docs/webhooks.md`
- `docs/mcp.md`
- `docs/prd-status-atual-2026-02-25.md`
