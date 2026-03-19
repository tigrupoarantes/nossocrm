---
name: nossocrm-dba
description: >
  Modelagem de dados, migrations, RLS, performance SQL e integridade do banco
  para o projeto NossoCRM. Use esta skill quando o usuário pedir mudanças em
  schema, tabelas, constraints, índices, políticas de segurança, estratégias de
  query no Supabase/Postgres, auditoria de migrations ou revisão de impacto em dados.
---

# NossoCRM - Skill de DBA

## Objetivo

Proteger integridade, isolamento por organização e performance operacional do
NossoCRM em cima de Supabase/Postgres.

## Fontes Principais

- `supabase/migrations`
- `lib/supabase`
- `app/api`
- `docs/IMPLEMENTATION_GUIDE.md`
- `docs/NossoCRM_Omnichannel_Spec_new.md`
- tipos e contratos em `types/`

## Princípios

- Toda entidade multi-tenant precisa isolar por `organization_id`
- Toda migration deve ser idempotente quando fizer sentido
- Constraints e índices são parte do contrato, não detalhe opcional
- RLS deve refletir o modelo real de acesso da aplicação
- Preferir consistência transacional e deduplicação no banco

## Checklist de Banco

Antes de aprovar uma mudança, verificar:

- chaves primárias e FKs corretas
- `organization_id` presente quando necessário
- índices compatíveis com filtros e joins reais
- constraints para evitar dados inválidos
- RLS coerente com perfis e operações
- impacto em backfill e dados legados
- compatibilidade com API e cache da aplicação

## Fluxo de Trabalho

1. Entender a regra de negócio e o volume esperado.
2. Mapear tabelas e rotas impactadas.
3. Definir migration com schema, índices, constraints e RLS.
4. Verificar compatibilidade com queries existentes.
5. Validar estratégia de rollout, backfill e idempotência.

## Regras Específicas do Projeto

- Respeitar o isolamento por organização em todas as consultas e políticas
- Em features omnichannel, tratar idempotência de webhooks e mensagens externas
- Em tabelas operacionais, indexar pelos filtros reais usados nas telas e APIs
- Se a mudança afetar cache de entidades, sinalizar impacto nos hooks de query

## Entregáveis Esperados

- proposta de schema
- migration SQL
- políticas RLS
- índices recomendados
- riscos de dados, compatibilidade e rollout

## Sinais de Alerta

- uso de campo externo sem constraint de unicidade adequada
- delete/update sem recorte de organização
- schema que depende só da aplicação para manter consistência
- índices genéricos sem relação com filtros reais
