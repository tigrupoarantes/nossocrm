---
name: nossocrm-squad-pro
description: >
  Orquestracao avancada de agentes especialistas para evolucao do projeto
  NossoCRM. Use esta skill quando o usuario quiser operar com uma squad mais
  completa, incluindo CRM, UX, Dev, DBA, Security, RevOps, Marketing,
  Automacao, testes e review.
---

# NossoCRM - Skill de Squad Pro

## Composicao da Squad

- `nossocrm-crm`: problema de negocio, fluxo comercial, regras funcionais
- `nossocrm-ux`: arquitetura de interface, navegacao, estados e consistencia
- `nossocrm-dev`: implementacao tecnica, arquitetura de codigo e integracao
- `nossocrm-dba`: schema, migrations, RLS, indices e integridade de dados
- `nossocrm-security`: auth, autorizacao, RLS, APIs, webhooks, secrets e IA segura
- `nossocrm-revops`: ownership, SLAs, forecast, produtividade e governanca comercial
- `nossocrm-marketing`: captura, qualificacao, lifecycle e handoff marketing -> vendas
- `nossocrm-automation`: triggers, playbooks, guardrails e IA operacional
- `nossocrm-tests`: estrategia e implementacao de testes
- `nossocrm-review`: revisao critica de seguranca, qualidade e regressao

## Regra de Despacho

Escolher o menor conjunto de especialistas que cubra a tarefa, mas nunca deixar
seguranca de fora quando houver superficie sensivel.

### Quando chamar cada agente

- Chame `nossocrm-crm` se a regra de negocio estiver indefinida, ambigua ou tiver impacto operacional.
- Chame `nossocrm-ux` se houver impacto em tela, fluxo, microcopy, navegacao ou acessibilidade.
- Chame `nossocrm-dev` para qualquer implementacao ou refatoracao.
- Chame `nossocrm-dba` se tocar schema, queries, migrations, webhooks, deduplicacao ou RLS.
- Chame `nossocrm-security` se houver auth, permissao, API publica, webhook, secret, token, integracao externa ou IA com acesso a dados.
- Chame `nossocrm-revops` se a mudanca afetar ownership, SLAs, produtividade, aging, forecast ou governanca comercial.
- Chame `nossocrm-marketing` se a mudanca tocar captacao, qualificacao, attribution, nurturing, lifecycle ou landing pages.
- Chame `nossocrm-automation` se houver triggers, filas, playbooks, cadencias, retries, jobs ou IA operacional.
- Chame `nossocrm-tests` quando houver comportamento novo ou risco de regressao.
- Chame `nossocrm-review` antes de fechar mudanca critica ou quando o usuario pedir revisao.

## Ordem Recomendada

### Feature nova de produto

1. `nossocrm-crm`
2. `nossocrm-marketing` ou `nossocrm-revops` se houver impacto comercial
3. `nossocrm-ux`
4. `nossocrm-dba`
5. `nossocrm-automation` se houver automacao
6. `nossocrm-dev`
7. `nossocrm-security` se houver superficie sensivel
8. `nossocrm-tests`
9. `nossocrm-review`

### Ajuste tecnico sem impacto funcional

1. `nossocrm-dev`
2. `nossocrm-dba` se houver dados
3. `nossocrm-security` se houver auth, APIs, secrets ou dados sensiveis
4. `nossocrm-tests`
5. `nossocrm-review`

### Ajuste visual ou de fluxo

1. `nossocrm-crm` se a regra estiver indefinida
2. `nossocrm-ux`
3. `nossocrm-dev`
4. `nossocrm-tests`
5. `nossocrm-review`

### Captacao, marketing e lifecycle

1. `nossocrm-marketing`
2. `nossocrm-crm`
3. `nossocrm-ux`
4. `nossocrm-dba`
5. `nossocrm-dev`
6. `nossocrm-security`
7. `nossocrm-tests`
8. `nossocrm-review`

### Automacao comercial

1. `nossocrm-crm`
2. `nossocrm-revops`
3. `nossocrm-automation`
4. `nossocrm-dba`
5. `nossocrm-dev`
6. `nossocrm-security`
7. `nossocrm-tests`
8. `nossocrm-review`

### Omnichannel e mensageria

1. `nossocrm-crm`
2. `nossocrm-revops`
3. `nossocrm-ux`
4. `nossocrm-dba`
5. `nossocrm-automation`
6. `nossocrm-dev`
7. `nossocrm-security`
8. `nossocrm-tests`
9. `nossocrm-review`

## Artefatos por Especialista

- CRM: objetivos, regras, edge cases, criterios de aceite
- UX: fluxo, estados, impacto visual, mobile e acessibilidade
- DBA: migrations, RLS, indices, constraints e rollout
- Security: riscos, controles, superficie de ataque, auditoria e riscos residuais
- RevOps: ownership, SLAs, metricas, aging, forecast e riscos operacionais
- Marketing: captura, sinais de qualificacao, attribution, handoff e mensuracao
- Automation: gatilhos, acoes, guardrails, observabilidade, retry e fallback
- Dev: arquivos, implementacao, contratos, integracoes e estrategia de cache
- Tests: cobertura minima, cenarios, mocks e validacao
- Review: findings, gaps e recomendacao final

## Regras do Projeto

- Respeitar `organization_id` em dados, queries, APIs e tools
- Em deals, usar sempre `[...queryKeys.deals.lists(), 'view']`
- Preferir `setQueryData` a invalidacao ampla quando houver escrita local
- Nao inventar novo padrao visual sem necessidade real
- Nao tratar banco como detalhe secundario em fluxos omnichannel
- Em fluxos de marketing, definir origem, qualificacao e handoff
- Em fluxos operacionais, considerar SLA, owner e observabilidade
- Em fluxos sensiveis, seguranca entra por padrao e nao por excecao

## Regras de Handoff

### CRM -> UX

Enviar:
- problema
- persona
- entidade central
- fluxo principal
- regras
- edge cases
- criterios de aceite

### UX -> DBA/Dev

Enviar:
- fluxo final
- estados de interface
- eventos do usuario
- dados necessarios
- componentes e pontos de integracao

### DBA -> Dev

Enviar:
- migrations
- contratos de dados
- indices e constraints
- backfill ou rollout
- riscos de compatibilidade

### Dev -> Security

Enviar:
- rotas, hooks e arquivos alterados
- dados acessados
- secrets ou tokens envolvidos
- pontos de auth/autorizacao
- superficie externa exposta

### Security -> Tests

Enviar:
- cenarios de abuso ou bypass
- controles esperados
- casos de auth, permissao, replay, spoofing ou vazamento

### Tests -> Review

Enviar:
- cobertura criada
- gaps remanescentes
- riscos nao protegidos
- comandos de validacao

## Checklist da Squad

- A feature melhora uma metrica de negocio explicita.
- O dono do fluxo esta claro: deal, contato, conversa ou atividade.
- O isolamento por `organization_id` foi respeitado.
- Deals seguem `DEALS_VIEW_KEY`.
- Ha estados de loading, vazio, erro e sucesso.
- O handoff marketing -> vendas esta explicito quando existir.
- A automacao tem guardrails e observabilidade.
- A seguranca foi revisada quando houver auth, webhook, API publica, secret ou IA.
- Forecast, SLA ou produtividade foram considerados quando relevantes.
- Ha cobertura minima de testes para a area de risco.

## Modo de Operacao

Ao receber uma tarefa:

1. classificar a natureza da demanda
2. selecionar especialistas necessarios
3. definir a ordem de trabalho
4. consolidar os artefatos de handoff
5. implementar
6. validar
7. fechar com riscos residuais

## Resposta Inicial Recomendada

Quando esta skill for acionada, comecar declarando:

- quais especialistas entram
- por que entram
- qual sera a ordem de trabalho
- quais artefatos cada um deve produzir
