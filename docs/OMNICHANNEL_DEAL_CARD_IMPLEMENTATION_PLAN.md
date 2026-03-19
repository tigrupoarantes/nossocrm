# NossoCRM Omnichannel Deal Card Implementation Plan

## Objetivo

Evoluir o deal card do NossoCRM para que o vendedor consiga conversar com o
lead no contexto do deal, com timeline unificada por canal, envio confiavel de
mensagens, estados claros de UX, seguranca adequada e cobertura minima de
testes.

## Resultado Esperado

Ao abrir um deal, o usuario deve conseguir:

- ver o historico de conversa do deal/contato em uma timeline unificada
- identificar claramente o canal de cada mensagem
- responder no canal correto com o canal padrao sugerido
- iniciar conversa em um canal ainda nao utilizado
- entender unread, status e falhas sem sair do deal card

## Decisoes de Produto

- O deal card sera a tela principal de atendimento.
- A Inbox continuara como fila operacional, nao como fluxo obrigatorio.
- O contato e a identidade principal; o canal e o meio de interacao.
- A visualizacao "Todas" serve para leitura e contexto.
- O envio operacional deve acontecer em um canal explicitamente ativo.
- O canal padrao sera o ultimo canal inbound do lead, quando existir.

## Escopo da Implementacao

### Incluido

- deal card omnichannel
- timeline unificada com identificacao de canal
- envio por canal a partir do deal
- estados de UX da aba de conversas
- endurecimento de backend, schema e seguranca ligados ao fluxo
- suite minima de testes para mensagens, hooks e deal card

### Fora de escopo imediato

- cockpit gerencial completo por canal
- automacoes avancadas por SLA e aging
- scoring de canal por performance comercial
- sincronizacao completa de Instagram/Facebook sem fechar a base de identidades

## Diagnostico Consolidado

### CRM

- A direcao do produto esta correta e a aba de conversas ja existe em
  `DealDetailModal`.
- O fluxo ainda esta hibrido entre deal-first e inbox-first.
- Ownership, unread, multiplos deals por contato e fallback de canal ainda
  precisam de regra explicita.

### UX

- A estrutura esta pronta, mas a conversa ainda parece secundaria dentro do
  modal.
- Faltam estados de erro, sync pending, channel unavailable e vazio por canal.
- O composer e o header da aba precisam comunicar melhor o canal ativo.

### DBA

- O schema suporta o MVP, mas nao garante integralmente o contrato omnichannel.
- Faltam unicidade por canal, protecao contra conversa duplicada por deal/canal,
  filtro real por canal e unread atomico.
- O dominio ainda esta muito orientado a WAHA.

### Security

- O fluxo de webhook e router ainda nao esta defensivo o suficiente.
- O uso de `service role` precisa de governanca mais forte.
- O backend nao deve confiar no canal informado pelo cliente sem validar a
  conversa, a org e a identidade externa do canal.

### Tests

- O projeto protege areas adjacentes, mas nao o fluxo do deal card omnichannel.
- Faltam testes de route handler, hook, controller e fluxo do modal.

## Plano por Fase

### Fase 1 - Contrato de negocio e UX

Objetivo:
- fechar a regra operacional do atendimento no deal card

Entregas:
- regra para canal padrao
- regra para multiplos deals por contato
- regra para deal ganho/perdido
- regra para canal sem conversa previa
- definicao dos estados da aba de conversas

Arquivos de referencia:
- `docs/NossoCRM_Omnichannel_Spec_new.md`
- [features/boards/components/Modals/DealDetailModal.tsx](C:/GIT%20GA/CRM/nossocrm/features/boards/components/Modals/DealDetailModal.tsx)
- [features/conversations/components/DealConversationsTab.tsx](C:/GIT%20GA/CRM/nossocrm/features/conversations/components/DealConversationsTab.tsx)

Critérios de aceite:
- o fluxo principal esta claro para vendedor e gestor
- os edge cases principais estao resolvidos em regra
- a UX diferencia leitura de contexto e resposta operacional

### Fase 2 - Banco e contratos de backend

Objetivo:
- endurecer o dominio de conversas para suportar omnichannel de forma nativa

Entregas:
- migration corretiva para `messages.external_message_id` por canal
- protecao contra conversa duplicada por `organization_id + deal_id + channel`
- indices compostos para o fluxo do deal card
- `CHECK` para `messages.status`
- filtro por canal implementado em `/api/conversations`
- correcao do fluxo inbound WAHA para nunca gravar `organization_id` vazio

Arquivos alvo:
- [supabase/migrations/20260318000000_omnichannel_schema.sql](C:/GIT%20GA/CRM/nossocrm/supabase/migrations/20260318000000_omnichannel_schema.sql)
- [app/api/conversations/route.ts](C:/GIT%20GA/CRM/nossocrm/app/api/conversations/route.ts)
- [app/api/deals/[id]/conversations/route.ts](C:/GIT%20GA/CRM/nossocrm/app/api/deals/%5Bid%5D/conversations/route.ts)
- [app/api/webhooks/waha/route.ts](C:/GIT%20GA/CRM/nossocrm/app/api/webhooks/waha/route.ts)

Critérios de aceite:
- nao ha colisoes de message id entre canais
- nao ha criacao duplicada de conversa por deal/canal
- unread_count nao depende de update fragil
- o filtro por canal responde corretamente para Inbox e deal card

### Fase 3 - Seguranca do fluxo de mensageria

Objetivo:
- fechar os riscos de tenant isolation, webhook e outbound

Entregas:
- `message-router` validando `organizationId` explicitamente
- backend derivando ou validando o canal real da conversa alvo
- webhook WAHA falhando de forma segura sem match confiavel
- padronizacao de timeout, erro e redacao de logs nos adapters
- consolidacao de regras para `service role`

Arquivos alvo:
- [app/api/messages/send/route.ts](C:/GIT%20GA/CRM/nossocrm/app/api/messages/send/route.ts)
- [lib/communication/message-router.ts](C:/GIT%20GA/CRM/nossocrm/lib/communication/message-router.ts)
- [lib/communication/waha.ts](C:/GIT%20GA/CRM/nossocrm/lib/communication/waha.ts)
- [lib/communication/meta-instagram.ts](C:/GIT%20GA/CRM/nossocrm/lib/communication/meta-instagram.ts)
- [lib/communication/meta-facebook.ts](C:/GIT%20GA/CRM/nossocrm/lib/communication/meta-facebook.ts)
- [lib/ai/tools.ts](C:/GIT%20GA/CRM/nossocrm/lib/ai/tools.ts)

Critérios de aceite:
- o envio nao aceita tenant mismatch
- o webhook nao grava conversa orfa
- secrets nao aparecem em resposta ou log
- fluxos com `service role` estao explicitamente defendidos

### Fase 4 - UX do deal card omnichannel

Objetivo:
- transformar a aba de conversas em experiencia operacional de verdade

Entregas:
- destaque visual da aba `Conversas` quando houver atividade
- header da aba com contato, canal padrao, disponibilidade e unread
- `ConversationThread` com `loading`, `error`, `emptyAll`, `emptyChannel`,
  `sending` e `syncPending`
- `MessageInput` com canal sugerido vs manual e suporte a indisponibilidade
- `MessageBubble` sempre identificando canal na timeline unificada

Arquivos alvo:
- [features/boards/components/Modals/DealDetailModal.tsx](C:/GIT%20GA/CRM/nossocrm/features/boards/components/Modals/DealDetailModal.tsx)
- [features/conversations/components/DealConversationsTab.tsx](C:/GIT%20GA/CRM/nossocrm/features/conversations/components/DealConversationsTab.tsx)
- [features/conversations/components/ConversationThread.tsx](C:/GIT%20GA/CRM/nossocrm/features/conversations/components/ConversationThread.tsx)
- [features/conversations/components/MessageInput.tsx](C:/GIT%20GA/CRM/nossocrm/features/conversations/components/MessageInput.tsx)
- [features/conversations/components/MessageBubble.tsx](C:/GIT%20GA/CRM/nossocrm/features/conversations/components/MessageBubble.tsx)

Critérios de aceite:
- o usuario entende em qual canal vai responder
- o composer continua visivel e claro em mobile
- os estados de erro e vazio orientam a proxima acao

### Fase 5 - Estado de dados e cache

Objetivo:
- reduzir fragilidade do fluxo e preparar realtime/optimistic update

Entregas:
- revisar `invalidateQueries` amplo em conversas
- preparar updates mais precisos do cache
- manter consistencia entre deal card, inbox e mensagens

Arquivos alvo:
- [lib/query/hooks/useConversationsQuery.ts](C:/GIT%20GA/CRM/nossocrm/lib/query/hooks/useConversationsQuery.ts)
- [features/conversations/hooks/useDealConversationsController.ts](C:/GIT%20GA/CRM/nossocrm/features/conversations/hooks/useDealConversationsController.ts)

Critérios de aceite:
- envio de mensagem atualiza o estado previsivelmente
- troca de canal nao gera thread inconsistente
- o fluxo fica pronto para otimista/realtime sem regressao facil

### Fase 6 - Testes e gates

Objetivo:
- proteger o fluxo minimo antes de abrir mais frentes

Entregas:
- testes de `app/api/messages/send/route.ts`
- testes de `useConversationsQuery.ts`
- testes de `useDealConversationsController.ts`
- testes de `DealConversationsTab.tsx`
- extensao de `DealDetailModal.test.tsx`
- fluxo integrado no estilo `story test`
- ampliacao de `test/webhooks/waha.test.ts`

Arquivos alvo:
- [app/api/messages/send/route.ts](C:/GIT%20GA/CRM/nossocrm/app/api/messages/send/route.ts)
- [lib/query/hooks/useConversationsQuery.ts](C:/GIT%20GA/CRM/nossocrm/lib/query/hooks/useConversationsQuery.ts)
- [features/conversations/hooks/useDealConversationsController.ts](C:/GIT%20GA/CRM/nossocrm/features/conversations/hooks/useDealConversationsController.ts)
- [features/conversations/components/DealConversationsTab.tsx](C:/GIT%20GA/CRM/nossocrm/features/conversations/components/DealConversationsTab.tsx)
- [features/boards/components/Modals/DealDetailModal.test.tsx](C:/GIT%20GA/CRM/nossocrm/features/boards/components/Modals/DealDetailModal.test.tsx)
- [test/webhooks/waha.test.ts](C:/GIT%20GA/CRM/nossocrm/test/webhooks/waha.test.ts)

Critérios de aceite:
- auth, ownership, tenant isolation e canal divergente estao cobertos
- webhook tem testes de segredo, deduplicacao e unread
- o fluxo abrir deal -> conversar -> trocar canal -> enviar mensagem esta protegido

## Backlog Prioritario para Amanha

### Bloco A - Base de backend e seguranca

1. Corrigir `/api/conversations` para filtrar por canal.
2. Endurecer `app/api/messages/send/route.ts` para validar melhor o canal alvo.
3. Tornar `message-router` defensivo por `organizationId`.
4. Corrigir `app/api/webhooks/waha/route.ts` para nunca gravar org vazia.

### Bloco B - Schema e integridade

5. Criar migration para:
- unicidade por canal em mensagens
- indices compostos por deal/canal e contato/canal
- `CHECK` de status
- estrategia de unread atomico

### Bloco C - UX do deal card

6. Refatorar `DealConversationsTab`.
7. Refatorar `ConversationThread`.
8. Refatorar `MessageInput`.
9. Padronizar `MessageBubble`.
10. Destacar a aba `Conversas` em `DealDetailModal`.

### Bloco D - Testes minimos

11. Route test de `messages/send`.
12. Hook test de `useConversationsQuery`.
13. Controller test de `useDealConversationsController`.
14. Component test de `DealConversationsTab`.
15. Extensao de `DealDetailModal.test.tsx`.

## Sequencia Recomendada de Execucao

1. backend + seguranca
2. migration + integridade
3. deal card UX
4. hooks/cache
5. testes

## Riscos Conhecidos

- coexistencia de fluxo novo omnichannel e fluxo legado de envio
- uso de `service role` sem governance central suficiente
- identidade fraca por telefone no inbound WAHA
- estado de cache ainda dependente de invalidacao ampla
- Inbox ainda semanticamente atras do deal card

## Definicao de Pronto

Uma entrega sera considerada pronta quando:

- o vendedor conseguir responder no deal card sem depender da Inbox
- o canal de envio estiver claro e seguro
- o backend impedir tenant mismatch e escrita orfa
- o schema garantir o contrato principal do dominio
- os testes minimos estiverem verdes para o fluxo de mensagens
- os riscos residuais estiverem documentados
