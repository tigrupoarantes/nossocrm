---
name: nossocrm-features
description: >
  Planejamento, especificação e implementação de novas funcionalidades para o NossoCRM.
  Use esta skill SEMPRE que o usuário quiser planejar, propor, especificar ou construir
  uma feature nova — seja uma integração, um módulo, uma tela, um fluxo de automação,
  ou qualquer adição significativa ao sistema. Acione ao ouvir frases como "quero adicionar",
  "nova funcionalidade", "criar módulo de", "implementar integração com", "nova tela de",
  "automatizar", "como faço para ter X no CRM". Gera especificações completas com contexto
  de negócio, impacto técnico, banco de dados, API e componentes necessários.
---

# NossoCRM — Skill de Planejamento de Features

## Processo de Especificação

Ao receber uma ideia de feature, siga estas etapas:

1. **Entender o problema de negócio** — qual dor do usuário resolve?
2. **Mapear impacto técnico** — quais partes do sistema são afetadas?
3. **Especificar banco de dados** — migrations necessárias
4. **Definir API** — endpoints, payloads, respostas
5. **Listar componentes** — telas, modais, formulários
6. **Estimar complexidade** — P/M/G e dependências

---

## Template de Especificação de Feature

Use este template para documentar cada feature:

```markdown
# Feature: [Nome da Feature]

## Contexto
[Por que essa feature é necessária? Qual problema resolve?]

## Usuários Impactados
- [ ] Vendedores
- [ ] Administradores
- [ ] Ambos

## Comportamento Esperado
[Descrição narrativa do que o usuário consegue fazer com essa feature]

## Casos de Uso Principais
1. [Caso de uso 1]
2. [Caso de uso 2]

## Casos de Uso Secundários / Edge Cases
- [Edge case 1]

---

## Especificação Técnica

### Banco de Dados (Supabase)
\`\`\`sql
-- Nova tabela ou alteração necessária
CREATE TABLE nova_tabela (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- campos específicos
);

-- RLS obrigatório
ALTER TABLE nova_tabela ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON nova_tabela
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
\`\`\`

### API Routes
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/recurso` | Lista recursos |
| POST | `/api/recurso` | Cria recurso |
| PATCH | `/api/recurso/[id]` | Atualiza recurso |
| DELETE | `/api/recurso/[id]` | Remove recurso |

### Estrutura de Arquivos
\`\`\`
features/nome-da-feature/
├── index.ts
├── components/
│   ├── NomeComponente.tsx
│   └── NomeModal.tsx
├── hooks/
│   └── useNomeFeature.ts
├── actions/
│   └── nome-actions.ts
└── types.ts
\`\`\`

### Tipos TypeScript
\`\`\`ts
export interface NovoRecurso {
  id: string
  orgId: string
  // campos
  createdAt: string
}
\`\`\`

---

## Critérios de Aceite

- [ ] [Critério verificável 1]
- [ ] [Critério verificável 2]
- [ ] Funciona em mobile (responsivo)
- [ ] Loading e error states implementados
- [ ] Multi-tenancy respeitado (isolamento por org)

## Complexidade
**Estimativa**: P / M / G
**Dependências**: [outras features ou integrações necessárias]
**Riscos**: [possíveis complicações técnicas]
```

---

## Módulos Existentes (para evitar duplicação)

Antes de propor uma feature, verificar se já existe:

| Módulo | Localização | O que faz |
|---|---|---|
| Pipeline/Kanban | `features/pipeline` | Board visual de deals |
| Deals | `features/deals` | CRUD de oportunidades |
| Contacts | `features/contacts` | Gestão de contatos e empresas |
| Activities | `features/activities` | Tarefas e compromissos |
| Inbox | `features/inbox` | Briefing diário com IA |
| AI Assistant | `features/ai-assistant` | Chat com IA integrado |
| Webhooks | `app/api/webhooks` | Entrada/saída de dados |
| Install Wizard | `app/(auth)/install` | Setup inicial |

---

## Integrações Disponíveis

O NossoCRM já possui infraestrutura para:
- **AI SDK v6**: Gemini, OpenAI, Anthropic — configurável por organização
- **Webhooks inbound**: receber leads de Hotmart, formulários, n8n, Make
- **Webhooks outbound**: notificar mudanças de estágio
- **Supabase Realtime**: atualizações em tempo real via websocket

---

## Priorização de Features

Use esta matriz para ajudar a priorizar:

| Impacto | Esforço | Prioridade |
|---|---|---|
| Alto | Baixo | 🔥 Fazer agora |
| Alto | Alto | 📋 Planejar bem |
| Baixo | Baixo | ✨ Quick wins |
| Baixo | Alto | ❌ Evitar |

---

## Checklist antes de implementar

- [ ] Feature especificada com template acima
- [ ] Migration de banco definida com RLS
- [ ] Endpoints de API mapeados
- [ ] Componentes listados
- [ ] Critérios de aceite claros
- [ ] Não duplica funcionalidade existente
- [ ] Compatível com multi-tenancy (org_id)
