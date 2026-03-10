---
name: nossocrm-dev
description: >
  Padrões de desenvolvimento, arquitetura e convenções de código para o projeto NossoCRM.
  Use esta skill SEMPRE que o usuário pedir para criar, editar ou refatorar qualquer arquivo
  do NossoCRM — componentes React, API routes, hooks, contextos, lib, features, ou integração
  com Supabase e AI SDK. Também use ao discutir arquitetura, estrutura de pastas, nomenclatura,
  ou boas práticas do projeto. Acione mesmo que o usuário diga apenas "cria um componente",
  "adiciona uma rota", "faz um hook" ou similar.
---

# NossoCRM — Skill de Desenvolvimento

## Stack & Versões

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 15+ (App Router) |
| UI | React 19 + TypeScript |
| Banco | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| IA | AI SDK v6 (Vercel) |
| Estilo | Tailwind CSS + Radix UI |
| Testes | Vitest |

---

## Estrutura do Projeto

```
nossocrm/
├── app/                    # Rotas Next.js App Router
│   ├── (auth)/             # Rotas públicas (login, install)
│   ├── (dashboard)/        # Rotas protegidas
│   └── api/                # API Routes
├── features/               # Módulos por domínio de negócio
│   ├── deals/
│   ├── contacts/
│   ├── pipeline/
│   ├── activities/
│   ├── inbox/
│   └── ai-assistant/
├── components/             # Componentes UI reutilizáveis
├── hooks/                  # Custom React hooks
├── context/                # Contextos React globais
├── lib/                    # Utilitários, clients, helpers
├── types/                  # Tipos TypeScript globais
└── supabase/               # Migrations e tipos gerados
```

---

## Convenções de Código

### Estrutura de uma Feature

Cada feature em `features/` deve seguir este padrão:
```
features/nome-da-feature/
├── index.ts               # Re-exports públicos
├── components/            # Componentes da feature
├── hooks/                 # Hooks específicos
├── actions/               # Server Actions ou API calls
├── types.ts               # Tipos da feature
└── utils.ts               # Utilitários locais
```

### Componentes React

```tsx
// ✅ Correto — componente funcional com TypeScript
interface Props {
  dealId: string
  onUpdate?: (deal: Deal) => void
}

export function DealCard({ dealId, onUpdate }: Props) {
  // hooks primeiro
  const { data, isLoading } = useDeal(dealId)
  
  // handlers depois
  const handleUpdate = async () => { ... }
  
  // render
  if (isLoading) return <Skeleton />
  return <div>...</div>
}
```

- Use **named exports** (não default) para componentes
- Props interface com nome `Props` dentro do arquivo, ou `NomeDoComponenteProps` se exportada
- Sempre tipar retorno de hooks e funções assíncronas

### Server Actions & API Routes

```ts
// app/api/deals/route.ts — padrão para API routes
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('org_id', user.user_metadata.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

### Supabase — Boas Práticas

- **Sempre** verificar autenticação antes de queries
- Usar `org_id` para isolamento multi-tenant em toda query
- Tipar com os tipos gerados em `supabase/types.ts`
- Preferir `select()` com colunas específicas, não `select('*')` em produção
- Usar RLS (Row Level Security) — nunca bypassar com service_role no frontend

```ts
// ✅ Query com isolamento de org
const { data } = await supabase
  .from('contacts')
  .select('id, name, email, stage')
  .eq('org_id', orgId)
  .order('created_at', { ascending: false })
```

### AI SDK v6

```ts
// Padrão para uso do AI SDK
import { streamText } from 'ai'
import { getAIProvider } from '@/lib/ai/provider'

export async function POST(req: Request) {
  const { messages, orgId } = await req.json()
  const model = await getAIProvider(orgId) // busca config da org

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    tools: { ... }
  })

  return result.toDataStreamResponse()
}
```

---

## Nomenclatura

| Tipo | Convenção | Exemplo |
|---|---|---|
| Componentes | PascalCase | `DealCard`, `ContactList` |
| Hooks | camelCase com `use` | `useDeal`, `useContacts` |
| Arquivos de componente | kebab-case | `deal-card.tsx` |
| Arquivos de hook | kebab-case | `use-deal.ts` |
| Variáveis/funções | camelCase | `fetchDeals`, `orgId` |
| Tipos/Interfaces | PascalCase | `Deal`, `Contact`, `OrgSettings` |
| Constantes | SCREAMING_SNAKE | `MAX_DEALS_PER_PAGE` |

---

## Padrões de Estado

- **Server State**: React Query ou SWR para dados do Supabase
- **Global State**: Context API (já existe em `context/`)
- **Form State**: React Hook Form
- **URL State**: searchParams do Next.js para filtros e paginação

---

## Checklist ao criar qualquer código

- [ ] Tipagem TypeScript completa (sem `any`)
- [ ] Autenticação verificada em rotas de API
- [ ] `org_id` incluído em todas as queries do Supabase
- [ ] Tratamento de erro (`try/catch` ou verificação de `error`)
- [ ] Loading state no componente
- [ ] Componente responsivo com Tailwind
- [ ] Acessibilidade básica (labels, aria quando necessário)
