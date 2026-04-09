# CLAUDE.md — NossoCRM

> Protocolo obrigatório para Claude Code neste projeto.
> Convenções técnicas (stack, cache, code style) estão em [AGENTS.md](AGENTS.md) — leia também.

---

## 1. Protocolo antes de QUALQUER execução ou solução

Sempre que receber uma tarefa (bug, feature, refactor, dúvida), siga esta ordem **antes** de propor solução ou rodar comandos:

1. **Ler memória** — checar `memory/MEMORY.md` (já carregada automaticamente) e abrir os arquivos relevantes ao tema antes de assumir contexto.
2. **Entender antes de mudar** — ler os arquivos envolvidos. Nunca propor edições em código que não foi lido nesta conversa.
3. **Reproduzir o problema mentalmente** — pedir mensagem de erro, log ou passos exatos quando o relato for vago. Não chutar.
4. **Acionar a skill certa** (ver §2) — skills do NossoCRM contêm o conhecimento acumulado; usá-las é mandatório, não opcional.
5. **Verificar memória de incidentes recorrentes** — ex.: WhatsApp/WAHA tem histórico de problemas, seguir checklist de [memory/project_whatsapp_integration.md](C:/Users/william.cintra/.claude/projects/c--GIT-GA-CRM-nossocrm/memory/project_whatsapp_integration.md) antes de propor fix.
6. **Só então** propor diagnóstico, plano e mudança.

> Atalho: se a tarefa é trivial (renomear variável, ajustar texto), pular direto para a execução. O protocolo vale para qualquer coisa que envolva lógica, banco, integração ou múltiplos arquivos.

---

## 2. Skills obrigatórias por tipo de tarefa

| Tarefa | Skill obrigatória |
|---|---|
| Criar/editar componente, hook, API route, lib | `nossocrm-dev` |
| Migration, RLS, índice, função SQL, trigger | `nossocrm-dba` |
| Planejar/especificar feature nova | `nossocrm-features` |
| Revisar código (próprio ou alheio) antes de commit | `nossocrm-review` |
| Escrever/revisar testes | `nossocrm-tests` |
| Qualquer coisa de WhatsApp, WAHA, Meta Cloud, webhook inbound, envio outbound, Super Agent IA | `nossocrm-whatsapp` |
| Auditoria, RLS, CSRF, XSS, rate limit, secrets, headers, LGPD | `nossocrm-security` |
| Landing pages, hero, copy, CTA, prova social, conversão, refator do system prompt do page-generator | `nossocrm-design` |

Se uma tarefa cruza áreas (ex.: feature nova com migration + UI + teste), acionar **todas** as skills relevantes em sequência.

---

## 3. Regras de execução segura

- **Nunca** rodar destrutivo sem confirmação explícita: `drop table`, `truncate`, `rm -rf`, `git reset --hard`, `git push --force`, `supabase db reset`, deletar branch, despublicar Edge Function.
- **Nunca** pular hooks (`--no-verify`) ou assinatura de commit sem autorização do usuário.
- **Nunca** comitar automaticamente — só commitar quando o usuário pedir explicitamente.
- **Sempre** preferir `setQueryData` a `invalidateQueries` (regra de cache do AGENTS.md).
- **Sempre** filtrar por `organization_id` em queries multi-tenant e tools de IA.
- **Antes de migration**: rodar a skill `nossocrm-dba`, validar RLS, conferir índices, e mostrar o SQL pro usuário antes de aplicar.
- **Antes de tocar webhook/integração**: checar se há simulador em `/settings/diagnostico` e sugerir teste por lá antes de mexer em produção.

---

## 4. Comunicação

- Respostas curtas e diretas — o usuário lê o diff, não precisa de resumo do que foi feito.
- Português do Brasil por padrão (o usuário escreve em pt-BR).
- Referências a arquivos sempre como link markdown clicável: `[arquivo.ts](caminho/arquivo.ts)`.
- Quando houver dúvida de escopo ou risco, **perguntar antes** em vez de assumir.
- Não inventar features, abstrações ou "melhorias" não pedidas. Fix de bug é só o fix.

---

## 5. Antes de dar uma tarefa por concluída

- [ ] `npm run lint` passa (zero warnings enforced)
- [ ] `npm run typecheck` passa
- [ ] Testes relevantes rodados (`npm run test:run` ou arquivo específico)
- [ ] Skill `nossocrm-review` acionada se mudou código de produção
- [ ] Sem `console.log`, `TODO` solto ou código morto introduzido
- [ ] Mudanças em RLS/migration foram explicadas ao usuário antes de aplicar
