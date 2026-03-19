---
name: nossocrm-ux
description: >
  UX, arquitetura de interface e qualidade de fluxo para o projeto NossoCRM.
  Use esta skill quando o usuário pedir para desenhar, revisar ou evoluir telas,
  navegação, experiência do usuário, microcopy, responsividade, acessibilidade
  ou consistência visual. Acione também em pedidos sobre Inbox, Boards, Deal Card,
  Landing Pages, onboarding, App Router e componentes compartilhados de UI.
---

# NossoCRM - Skill de UX

## Objetivo

Garantir que novas entregas mantenham coerência com a experiência do produto e
melhorem clareza, velocidade de uso e previsibilidade nos fluxos principais.

## Áreas Prioritárias

- `app/(protected)` para arquitetura de navegação e rotas principais
- `features/inbox` para mesa de trabalho, foco e conversas
- `features/boards` para pipeline, kanban e deal card
- `features/landing-pages` para criação, preview e publicação
- `components/ui` para padrões compartilhados
- `app/globals.css` e `components/Layout.tsx` para shell visual

## Critérios de Avaliação

Sempre avaliar:

- Hierarquia visual: o que precisa chamar atenção primeiro
- Densidade de informação: evitar telas pesadas sem agrupamento claro
- Continuidade de fluxo: o usuário entende o próximo passo sem esforço
- Feedback de sistema: loading, erro, vazio e sucesso explícitos
- Responsividade: desktop e mobile sem perda de função crítica
- Acessibilidade: labels, foco, semântica, contraste e teclado

## Regras para Propor Mudanças

- Preservar padrões existentes quando o módulo já estiver consistente
- Só introduzir novo padrão visual se resolver uma inconsistência real
- Priorizar mudanças que reduzam cliques, troca de contexto ou ambiguidade
- Em fluxos complexos, propor primeiro estrutura e estados, depois estilo
- Ao mexer em componentes compartilhados, mapear impacto em outras telas

## Fluxo de Trabalho

1. Ler a feature alvo e identificar o fluxo principal do usuário.
2. Mapear estados essenciais: loading, vazio, erro, sucesso e ação crítica.
3. Verificar consistência com componentes de `components/ui`.
4. Apontar gargalos de navegação, compreensão e densidade visual.
5. Propor solução com impacto, risco e arquivos prováveis.

## Entregáveis Esperados

Quando o usuário pedir análise ou proposta, responder com:

- Estado atual da UX
- Oportunidades de maior impacto
- Riscos de consistência ou fluxo
- Próximos passos recomendados

Quando o usuário pedir implementação, definir:

- fluxo alvo
- componentes a criar ou ajustar
- estados da interface
- efeitos em mobile e acessibilidade

## Checklist Rápido

- Existe um CTA principal claro?
- O usuário sabe onde está e o que fazer depois?
- O mesmo conceito usa o mesmo padrão visual em telas diferentes?
- O estado vazio orienta a primeira ação?
- O fluxo funciona com teclado e em largura pequena?
