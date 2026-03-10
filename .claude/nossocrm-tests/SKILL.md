---
name: nossocrm-tests
description: >
  Escrita, revisão e estratégia de testes para o projeto NossoCRM. Use esta skill SEMPRE
  que o usuário quiser escrever testes, melhorar cobertura, testar um componente/hook/API,
  ou discutir estratégia de testes. Acione ao ouvir "escreve um teste", "como testar isso",
  "adiciona testes", "cobertura de testes", "teste unitário", "teste de integração", "mocking
  do Supabase", ou qualquer menção a Vitest, testing-library ou testes no projeto.
  Cobre: testes unitários com Vitest, testes de componentes com Testing Library,
  mocking do Supabase e AI SDK, e testes de API routes.
---

# NossoCRM — Skill de Testes

## Stack de Testes

| Ferramenta | Uso |
|---|---|
| **Vitest** | Test runner principal (config em `vitest.config.ts`) |
| **@testing-library/react** | Testes de componentes React |
| **@testing-library/user-event** | Simulação de interações do usuário |
| **MSW (Mock Service Worker)** | Mock de API routes e fetch |
| **vi.mock** | Mock de módulos (Supabase client, AI SDK) |

---

## Estrutura de Testes

```
test/
├── unit/           # Testes unitários (utils, hooks, funções puras)
├── components/     # Testes de componentes React
├── api/            # Testes de API routes
├── integration/    # Testes de integração (fluxos completos)
└── mocks/          # Mocks compartilhados
    ├── supabase.ts
    ├── ai-provider.ts
    └── handlers.ts  # MSW handlers
```

---

## Padrão de Teste — Funções Utilitárias

```ts
// test/unit/deals/format-deal.test.ts
import { describe, it, expect } from 'vitest'
import { formatDealValue, getDealStatus } from '@/features/deals/utils'

describe('formatDealValue', () => {
  it('formata valor em reais corretamente', () => {
    expect(formatDealValue(50000)).toBe('R$ 50.000,00')
  })

  it('retorna zero formatado para valor nulo', () => {
    expect(formatDealValue(null)).toBe('R$ 0,00')
  })
})

describe('getDealStatus', () => {
  it('retorna "parado" para deals sem atividade há mais de 10 dias', () => {
    const oldDate = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString()
    expect(getDealStatus({ lastActivityAt: oldDate })).toBe('parado')
  })
})
```

---

## Padrão de Teste — Hooks

```ts
// test/unit/hooks/use-deals.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDeals } from '@/features/deals/hooks/use-deals'
import { mockSupabase } from '../mocks/supabase'

// Mock do cliente Supabase
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase
}))

describe('useDeals', () => {
  beforeEach(() => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: '1', title: 'Deal Teste', value: 10000 }],
          error: null
        })
      })
    })
  })

  it('retorna deals da organização', async () => {
    const { result } = renderHook(() => useDeals('org-123'))

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1)
      expect(result.current.data[0].title).toBe('Deal Teste')
    })
  })

  it('retorna erro quando query falha', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'DB Error' }
        })
      })
    })

    const { result } = renderHook(() => useDeals('org-123'))
    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })
  })
})
```

---

## Padrão de Teste — Componentes

```tsx
// test/components/deals/deal-card.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DealCard } from '@/features/deals/components/DealCard'

const mockDeal = {
  id: '1',
  title: 'Projeto X',
  value: 50000,
  stage: 'negociacao',
  contactName: 'Maria Silva'
}

describe('DealCard', () => {
  it('renderiza título e valor do deal', () => {
    render(<DealCard deal={mockDeal} />)
    expect(screen.getByText('Projeto X')).toBeInTheDocument()
    expect(screen.getByText('R$ 50.000,00')).toBeInTheDocument()
  })

  it('chama onEdit ao clicar no botão de editar', async () => {
    const onEdit = vi.fn()
    render(<DealCard deal={mockDeal} onEdit={onEdit} />)

    await userEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect(onEdit).toHaveBeenCalledWith(mockDeal.id)
  })

  it('exibe skeleton durante loading', () => {
    render(<DealCard deal={null} isLoading />)
    expect(screen.getByTestId('deal-skeleton')).toBeInTheDocument()
  })
})
```

---

## Padrão de Teste — API Routes

```ts
// test/api/deals/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '@/app/api/deals/route'
import { mockSupabase, mockUser } from '../../mocks/supabase'

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockSupabase
}))

describe('GET /api/deals', () => {
  beforeEach(() => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null
    })
  })

  it('retorna 401 sem autenticação', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null
    })

    const req = new Request('http://localhost/api/deals')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('retorna deals da organização autenticada', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: '1', title: 'Deal' }],
          error: null
        })
      })
    })

    const req = new Request('http://localhost/api/deals')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toHaveLength(1)
  })
})
```

---

## Mock Padrão do Supabase

```ts
// test/mocks/supabase.ts
import { vi } from 'vitest'

export const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  user_metadata: { org_id: 'org-123' }
}

export const mockSupabase = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    signOut: vi.fn()
  },
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null })
  })
}
```

---

## O que testar em cada tipo de código

| Tipo | Prioridade de teste |
|---|---|
| Funções utilitárias puras | 🔥 Alta — 100% cobertura |
| Hooks com lógica de negócio | 🔥 Alta |
| API Routes | 🔥 Alta — incluir casos de auth |
| Componentes complexos | 🟡 Média — fluxos principais |
| Componentes visuais simples | 🟢 Baixa — snapshot |
| Páginas inteiras | 🟢 Baixa — E2E no futuro |

---

## Comandos

```bash
npm test                    # Roda todos os testes
npm test -- --watch         # Modo watch
npm test -- --coverage      # Com cobertura
npm test -- path/do/arquivo # Arquivo específico
```

---

## Checklist ao escrever testes

- [ ] Testa o comportamento, não a implementação
- [ ] Cada teste tem um único propósito (um `expect` principal)
- [ ] Casos de erro e edge cases cobertos
- [ ] Mocks limpos entre testes (`beforeEach` + `vi.clearAllMocks()`)
- [ ] Nomes de teste descritivos em português ou inglês (consistente)
- [ ] API routes testam o caso de 401 (sem auth)
- [ ] Hooks testam loading, success e error states
