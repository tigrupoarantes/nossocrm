---
name: nossocrm-squad
description: >
  Orquestração de agentes especialistas para evolução do projeto NossoCRM.
  Use esta skill quando o usuário quiser trabalhar em modo multiagente, montar
  uma squad para uma feature, ou pedir ajuda coordenada entre UX, Dev, DBA, CRM,
  review e testes. Esta skill decide quais especialistas acionar, em que ordem,
  e quais artefatos cada um deve produzir.
---

# NossoCRM - Skill de Squad Multiagente

## Composição da Squad

- `nossocrm-crm`: problema de negócio, fluxo comercial, regras funcionais
- `nossocrm-ux`: arquitetura de interface, navegação, estados e consistência
- `nossocrm-dev`: implementação técnica, arquitetura de código e integração
- `nossocrm-dba`: schema, migrations, RLS, índices e integridade de dados
- `nossocrm-review`: revisão crítica de segurança, qualidade e regressão
- `nossocrm-tests`: estratégia e implementação de testes

## Regra de Despacho

Escolher o menor conjunto de especialistas que cubra a tarefa.

### Quando chamar cada agente

- Chame `nossocrm-crm` se a regra de negócio estiver indefinida ou ambígua.
- Chame `nossocrm-ux` se houver impacto em tela, fluxo, navegação ou microcopy.
- Chame `nossocrm-dev` para qualquer implementação ou refatoração.
- Chame `nossocrm-dba` se tocar schema, queries, migrations, webhooks, deduplicação ou RLS.
- Chame `nossocrm-review` quando o usuário pedir revisão ou antes de fechar mudança crítica.
- Chame `nossocrm-tests` quando houver comportamento novo ou risco de regressão.

## Ordem Recomendada

### Feature nova

1. `nossocrm-crm`
2. `nossocrm-ux`
3. `nossocrm-dba`
4. `nossocrm-dev`
5. `nossocrm-tests`
6. `nossocrm-review`

### Ajuste técnico sem impacto funcional

1. `nossocrm-dev`
2. `nossocrm-dba` se houver dados
3. `nossocrm-tests`
4. `nossocrm-review`

### Ajuste visual/fluxo

1. `nossocrm-ux`
2. `nossocrm-dev`
3. `nossocrm-tests`

## Artefatos por Especialista

- CRM: objetivos, regras, edge cases, critérios de aceite
- UX: fluxo, estados, impacto visual e acessibilidade
- DBA: migration, RLS, índices, riscos de rollout
- Dev: arquivos, implementação, contratos e integrações
- Tests: cobertura mínima, cenários e mocks
- Review: riscos, bugs potenciais e pendências

## Regras do Projeto

- Respeitar `organization_id` em dados e ferramentas
- Em deals, usar sempre `[...queryKeys.deals.lists(), 'view']`
- Preferir `setQueryData` a invalidação ampla
- Não inventar novo padrão visual sem necessidade
- Não tratar banco como detalhe secundário em fluxos omnichannel

## Modo de Operação

Ao receber uma tarefa:

1. classificar a natureza da demanda
2. selecionar especialistas necessários
3. consolidar uma sequência curta de trabalho
4. executar implementação
5. validar e fechar com riscos residuais

## Resposta Inicial Recomendada

Quando esta skill for acionada, comece declarando:

- quais especialistas entram
- por que entram
- qual será a ordem de trabalho
