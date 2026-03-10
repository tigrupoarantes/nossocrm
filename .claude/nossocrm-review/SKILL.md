---
name: nossocrm-review
description: >
  Revisão de código (code review) para o projeto NossoCRM. Use esta skill SEMPRE que o
  usuário pedir para revisar, auditar, checar ou dar feedback sobre código do NossoCRM.
  Acione também quando o usuário perguntar "isso está certo?", "tem algo errado?",
  "melhora esse código", "revisa esse componente/hook/rota" ou colar um trecho de código
  pedindo opinião. A revisão cobre: segurança (auth/RLS), performance, padrões do projeto,
  TypeScript, multi-tenancy, acessibilidade e qualidade geral.
---

# NossoCRM — Skill de Code Review

## Filosofia de Revisão

O objetivo é garantir código **seguro, consistente e maintível** dentro da stack do NossoCRM.
Toda revisão deve ser construtiva: aponte o problema, explique o porquê e sugira a correção.

---

## Checklist de Revisão (nesta ordem)

### 🔴 Crítico — Bloqueia merge

**Segurança & Auth**
- [ ] Toda API route verifica `supabase.auth.getUser()` antes de qualquer operação
- [ ] Nunca usa `service_role` key no client-side
- [ ] Toda query inclui `.eq('org_id', orgId)` — isolamento multi-tenant
- [ ] Não expõe dados de outras organizações
- [ ] Sem secrets ou chaves hardcoded

**Banco de Dados**
- [ ] Sem SQL injection (use sempre o client Supabase, nunca template strings em queries)
- [ ] Mutations verificam se o recurso pertence à org antes de alterar
- [ ] Sem `.from('tabela').delete()` sem filtro de `org_id`

---

### 🟡 Importante — Deve corrigir

**TypeScript**
- [ ] Sem uso de `any` — usar tipos específicos ou `unknown` com type guard
- [ ] Interfaces e tipos definidos para todos os dados de API
- [ ] Retorno de funções tipado quando não inferível

**Qualidade de Código**
- [ ] Sem código comentado ou `console.log` de debug
- [ ] Funções com responsabilidade única (máximo ~50 linhas)
- [ ] Sem duplicação — verificar se já existe hook/util similar em `lib/` ou `hooks/`
- [ ] Tratamento de todos os casos de erro (loading, error, empty state)
- [ ] Sem `useEffect` desnecessário — checar se React Query resolve o caso

**Performance**
- [ ] Queries Supabase com `select()` de colunas específicas, não `select('*')`
- [ ] Componentes grandes divididos adequadamente
- [ ] Sem re-renders desnecessários (verificar dependências de `useCallback`/`useMemo`)
- [ ] Imagens com `next/image`

---

### 🟢 Sugestão — Nice to have

**Consistência**
- [ ] Nomenclatura segue as convenções do projeto (ver nossocrm-dev)
- [ ] Estrutura do arquivo segue padrão da feature correspondente
- [ ] Imports organizados: externos → internos → relativos

**UX & Acessibilidade**
- [ ] Loading skeleton ao invés de spinner quando possível
- [ ] Mensagens de erro amigáveis para o usuário
- [ ] Labels em inputs de formulário
- [ ] Botões com texto descritivo (não só ícone)

---

## Padrões de Feedback

Use este formato ao revisar:

```
## Revisão de Código

### 🔴 Crítico
**[Nome do problema]**
Arquivo: `path/do/arquivo.ts`, linha X
Problema: [explica o risco]
Correção:
\`\`\`ts
// código corrigido
\`\`\`

### 🟡 Importante
...

### 🟢 Sugestões
...

### ✅ Pontos Positivos
[O que está bem feito]
```

---

## Exemplos de Problemas Comuns

### ❌ Falta de verificação de auth
```ts
// PROBLEMA: rota sem verificação de autenticação
export async function GET() {
  const supabase = createClient()
  const { data } = await supabase.from('deals').select('*') // ❌ sem auth check
  return NextResponse.json(data)
}

// ✅ CORRETO
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const orgId = user.user_metadata.org_id
  const { data } = await supabase
    .from('deals')
    .select('id, title, value, stage')
    .eq('org_id', orgId) // ✅ isolamento por org
  return NextResponse.json(data)
}
```

### ❌ Query sem isolamento de org
```ts
// PROBLEMA: retorna dados de TODAS as orgs
const { data } = await supabase.from('contacts').select('*') // ❌

// ✅ CORRETO
const { data } = await supabase
  .from('contacts')
  .select('id, name, email')
  .eq('org_id', orgId) // ✅
```

### ❌ `any` no TypeScript
```ts
// PROBLEMA
const handleData = (data: any) => { ... } // ❌

// ✅ CORRETO
const handleData = (data: Contact) => { ... } // ✅
```

### ❌ Sem tratamento de erro
```ts
// PROBLEMA
const { data } = await supabase.from('deals').select('*')
return data // ❌ ignora error

// ✅ CORRETO
const { data, error } = await supabase.from('deals').select('*')
if (error) return NextResponse.json({ error: error.message }, { status: 500 })
return NextResponse.json(data)
```
