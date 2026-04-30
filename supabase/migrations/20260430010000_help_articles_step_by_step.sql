-- =============================================================================
-- HELP ARTICLES — passo-a-passo narrativo para os 3 fluxos críticos
-- =============================================================================
-- Atualiza/insere artigos detalhados em pt-BR pra Central de Ajuda. Tom
-- narrativo: explica o porquê de cada passo, não só "clique aqui". Foco nos
-- fluxos onde os usuários mais travam:
--   1. Conectar WhatsApp (WAHA + Meta) — atualiza o existente.
--   2. Criar automação "lead novo → WhatsApp" — novo.
--   3. Configurar "lead respondeu → mover stage" — novo.
-- =============================================================================

-- 1) Conectar WhatsApp — substitui o conteúdo raso atual.
INSERT INTO public.help_articles (title, slug, content_md, category, tags)
VALUES (
  'Como conectar o WhatsApp ao NossoCRM (passo a passo)',
  'como-conectar-whatsapp',
  $content$# Como conectar o WhatsApp ao NossoCRM

## Por que isso importa

O NossoCRM precisa "falar" com o WhatsApp pra mandar mensagem pros leads automaticamente. Sem essa conexão, todas as automações que envolvem WhatsApp (primeira mensagem ao receber lead novo, follow-up automático, agente IA, disparo em massa) ficam paradas. Conectar WhatsApp é o **passo zero** pra usar quase tudo de verdade.

## Os dois caminhos

Você pode conectar de duas formas. Escolha **uma**:

- **Meta Cloud API** — API oficial do WhatsApp. Boa pra empresa que já tem WhatsApp Business verificado e quer usar o caminho "homologado". Sem servidor pra cuidar.
- **WAHA (self-hosted)** — gateway open-source que roda num servidor seu. Sem custo por mensagem, mas exige Docker rodando em algum lugar (VPS, máquina interna). É o caminho que a maioria começa.

Esse tutorial cobre o **caminho WAHA**, que é o mais comum.

## Antes de começar

Pra conectar via WAHA você vai precisar de três coisas em mãos:

1. **Endereço do servidor WAHA** — algo tipo `https://waha.minhaempresa.com.br`. Se você ainda não tem, peça pra equipe de TI subir um container Docker do WAHA. Ele precisa ficar acessível pela internet pra Meta enviar webhooks.
2. **API Key** — uma senha que você definiu quando subiu o WAHA. Sem ela, qualquer um conseguia mandar mensagem pelo seu número.
3. **Celular com WhatsApp Business** aberto pra escanear o QR Code.

Tendo isso, o resto leva uns 3 minutos.

## Passo a passo

### 1. Abra Configurações → Integrações

No menu lateral, clique no seu avatar e escolha **Configurações**. Na tela que abrir, vá na aba **Integrações** (ou Comunicação). Você verá vários cards: SMTP, WhatsApp Meta, WhatsApp WAHA, etc.

### 2. Preencha o card "WhatsApp (WAHA)"

Role até achar. São três campos:

- **URL base do servidor WAHA** — cole o endereço completo, com `https://`. Ex.: `https://waha.minhaempresa.com.br`. **Não coloque `/api` no final** — só a base.
- **API Key** — cole a chave que protege seu servidor. Geralmente é uma string longa, tipo um token. Se você não sabe qual é, pergunta pro TI.
- **Nome da sessão** — deixe `default` se você vai usar só uma instância. Se a empresa tem mais de um número de WhatsApp e cada equipe usa o seu, cada nome de sessão é uma instância diferente.

### 3. Clique em "Salvar configurações"

Bem no fim da página, botão azul. Salva no banco. Aparece um toast verde "Configurações salvas".

### 4. Clique em "Iniciar sessão"

Agora volte ao card WAHA. Apareceu um botão verde "Iniciar sessão". Clique. O CRM conversa com o seu servidor WAHA e abre uma sessão nova.

### 5. Escaneie o QR Code

Em alguns segundos um QR Code aparece na tela. Pegue o celular onde está o WhatsApp Business da empresa e siga:

`Configurações → Aparelhos conectados → Conectar um aparelho`

Aponte a câmera do celular pro QR. Em 5–10 segundos a conexão é feita.

### 6. Confirme o "WORKING"

O painel de status do WAHA agora mostra um pontinho verde e a palavra **Conectado**. Pronto, o WhatsApp está integrado e o NossoCRM já consegue enviar e receber mensagens em nome desse número.

## Testando se ficou bom

Antes de sair criando automação, faça um teste:

1. Volte em **Configurações → Comunicação**
2. Clique em **Testar conexão** dentro do card WAHA
3. Se aparecer **"Conexão WAHA funcionando!"** — está tudo certo
4. Mande uma mensagem qualquer de outro WhatsApp pro número conectado. Em até 1 segundo ela deve aparecer no menu **Conversas** do CRM

## Se algo der errado

**"Falha WAHA: connection refused"** — A URL está errada ou o servidor WAHA caiu. Abra a URL no navegador, deve responder algo. Se não responder, é o servidor que está fora.

**"Falha WAHA: 401 Unauthorized"** — A API Key está errada. Confira com o TI a chave que foi configurada na variável de ambiente `WHATSAPP_API_KEY` do servidor.

**QR Code não aparece, status fica "STARTING" pra sempre** — A engine do WAHA travou. Encerre a sessão (botão "Encerrar sessão") e inicie de novo.

**QR expirou antes de eu escanear** — Acontece quando você demora mais de 30s. Encerre e inicie de novo.

**Mensagens enviadas chegam corrompidas no destinatário** — Bug conhecido em algumas versões do WAHA com a engine NOWEB. Peça pro TI rodar o WAHA com a engine **GOWS**, é a mais estável atualmente.

## Próximos passos

Com WhatsApp conectado, você pode:

1. **Criar a primeira automação** — mensagem automática toda vez que entra um lead novo no board. Veja o tutorial **"Como criar uma automação de mensagem para leads novos"**.
2. **Configurar resposta automática** — quando o lead responde, mover ele de estágio sozinho. Veja **"Como mover o card automaticamente quando o lead responde"**.
3. **Importar base fria** — em `/contacts`, "Importar CSV" agora permite escolher um board destino. Os contatos viram deals e disparam as automações que você acabou de criar.
$content$,
  'whatsapp',
  ARRAY['conexão', 'qr code', 'waha', 'whatsapp', 'tutorial', 'passo a passo']
)
ON CONFLICT (slug) DO UPDATE
  SET title = EXCLUDED.title,
      content_md = EXCLUDED.content_md,
      tags = EXCLUDED.tags,
      updated_at = now();


-- 2) Automação: lead novo → WhatsApp automático.
INSERT INTO public.help_articles (title, slug, content_md, category, tags)
VALUES (
  'Como criar uma automação de mensagem para leads novos',
  'automacao-lead-novo-whatsapp',
  $content$# Como criar uma automação de mensagem para leads novos

## Por que isso importa

A regra de ouro do comercial é: **lead frio fica frio em horas**. Se o lead chega às 14h e ninguém fala com ele até as 17h, a chance de fechar caiu pela metade. Automação resolve isso: no instante em que o lead entra no board, o CRM já manda a primeira mensagem por você. Sem ninguém digitando, sem esperar o vendedor ver o card.

Esse tutorial mostra como configurar essa automação do zero. Funciona pra leads que entram por qualquer canal: importação de CSV, formulário do site, Facebook Lead Ads, criação manual.

## Antes de começar

Você precisa ter:

- WhatsApp **conectado** (WAHA ou Meta). Se ainda não tem, faça primeiro o tutorial **"Como conectar o WhatsApp ao NossoCRM"**.
- Pelo menos **um board criado** com estágios (idealmente um chamado "Lead novo" ou "Qualificação").

## Como funciona por baixo

Quando você cria uma regra com gatilho `Quando um lead entra no board`, o CRM começa a "ouvir" todos os deals novos desse board. Toda vez que aparece um, ele agenda uma execução pra rodar **dentro de no máximo 15 minutos** (o ciclo do processador de automações). Na hora certa, ele dispara a ação que você configurou — no nosso caso, manda WhatsApp.

Se o lead não tem telefone cadastrado, a automação registra o erro mas não trava nada. Você pode olhar depois em `/automacoes` e ver o histórico.

## Passo a passo

### 1. Vá em Automações

No menu lateral, clique em **Automações**. Vai abrir a tela onde ficam todas as regras configuradas.

### 2. Clique em "+ Nova regra"

Botão azul no canto superior direito. Abre o formulário de criação.

### 3. Dê um nome humano

Algo descritivo, tipo `Boas-vindas leads novos do site` ou `Primeira mensagem CSV importado`. Esse nome só aparece pra você na lista de regras — escolha algo que daqui a 6 meses você ainda entenda.

### 4. Escolha o board

No campo **Board**, selecione qual funil essa regra vai monitorar. Se você só tem um board, é fácil. Se tem vários (vendas, pós-venda, etc.), escolha o que recebe leads novos.

> **Dica**: você pode deixar "Todos os boards", mas geralmente é melhor uma regra por board. Cada funil tem mensagem diferente.

### 5. Gatilho: "Quando um lead entra no board"

Esse é o gatilho `deal_created`. Ele dispara assim que um deal é criado naquele board, não importa de onde veio o lead.

### 6. Ação: "Enviar mensagem WhatsApp"

Esse é o action `send_whatsapp`. O CRM vai pegar o telefone do contato vinculado ao deal e mandar a mensagem que você escrever no próximo passo.

### 7. Escreva a mensagem

Aqui mora o segredo de uma boa automação. Algumas regras práticas:

- **Comece com o nome dele**. Use a variável `{{nome_contato}}` — o CRM substitui pelo nome real na hora de enviar. Soa pessoal, não automático.
- **Apresente-se rapidinho**. "Aqui é a Maria do time da [Empresa]"
- **Diga por que está mandando**. "Vi que você baixou nosso material sobre…"
- **Termine com uma pergunta aberta**. "Quando seria um bom momento pra falar 10 minutos?"
- **Curto**. 3 a 5 linhas. Mais que isso parece spam.

Exemplo bom:

```
Olá, {{nome_contato}}! Aqui é a Maria do time da Acme.

Vi que você se cadastrou no nosso site hoje. Posso te mandar
um material rápido sobre como a gente ajuda empresas como a
{{empresa_lead}} a economizar tempo no comercial?
```

### 8. Variáveis disponíveis

Os botões abaixo da mensagem inserem variáveis. Elas são substituídas pelos dados reais do lead na hora do envio:

- `{{nome_contato}}` — nome cadastrado no contato
- `{{empresa_lead}}` — nome da empresa do lead (se preenchido)
- `{{cnpj}}` — CNPJ da empresa
- `{{segmento}}` — segmento de atuação

Se um campo não está preenchido no contato, ele vira string vazia (não aparece "undefined" pro lead — fique tranquilo).

### 9. Clique em "Criar regra"

A regra entra na lista como **Ativa** por padrão. Você pode pausar ela depois com o toggle do lado.

## Testando se está funcionando

A melhor forma de testar é criar um lead falso:

1. Vá em **Contatos** → **+ Novo contato**
2. Crie um contato com **seu próprio número** de WhatsApp
3. Vá no **Board** que você configurou e crie um deal manualmente vinculado a esse contato
4. Aguarde **até 15 minutos** (o cron processa em lotes)
5. Você deve receber a mensagem no seu WhatsApp

Se em 30 minutos não recebeu, vá em `/automacoes`, clique na regra e veja o histórico de execução. Erros aparecem lá.

## Erros comuns

**"Contact has no phone number"** — O lead foi criado sem telefone. Confira o cadastro do contato.

**"WAHA not configured for this organization"** — Faltou conectar WhatsApp antes. Volte pro tutorial de conexão.

**Mensagem não chega no destinatário mas sai sem erro** — Engine do WAHA não está estável. Peça pro TI verificar se está rodando GOWS e se a sessão está "WORKING".

**A regra não dispara** — Confira se está marcada como **Ativa** na lista. E confirme que o board do deal é o mesmo da regra.

## Cuidados

- **Não mande mensagem pra base fria sem opt-in**. WhatsApp bloqueia números que recebem muitas reclamações. Mensagem automática só pra leads que aceitaram receber (formulário, conversa anterior, importação consensual).
- **Comece com volume baixo**. Antes de ligar pra base de 10 mil, teste com 50. Se chegar bem, sobe pra 500. Não vai querendo escalar de zero a milhares.
- **Monitore os primeiros dias**. Deixe a aba de Automações aberta e veja se as execuções estão dando "success" ou "error". Pra cada erro, entenda a causa antes de seguir.
$content$,
  'whatsapp',
  ARRAY['automação', 'whatsapp', 'lead novo', 'deal_created', 'tutorial', 'passo a passo']
)
ON CONFLICT (slug) DO UPDATE
  SET title = EXCLUDED.title,
      content_md = EXCLUDED.content_md,
      tags = EXCLUDED.tags,
      updated_at = now();


-- 3) Automação: lead respondeu → mover card de stage.
INSERT INTO public.help_articles (title, slug, content_md, category, tags)
VALUES (
  'Como mover o card automaticamente quando o lead responde',
  'automacao-resposta-mover-stage',
  $content$# Como mover o card automaticamente quando o lead responde

## Por que isso importa

Imagina que você tem 200 leads no estágio "Aguardando resposta". O vendedor precisa entrar em cada card, ver se chegou mensagem nova, e mover pra "Em conversa" manualmente. Em 200 cards isso é meia hora de trabalho repetitivo por dia.

Pior: muitos cards ficam parados porque ninguém viu que o lead respondeu. O vendedor vai conversar com quem está mais visível, e os cards parados perdem timing.

A automação **"resposta recebida → mover de estágio"** resolve isso. No segundo em que o lead responde **qualquer mensagem** (texto, áudio, foto, sticker), o CRM move o card pra coluna onde o vendedor precisa agir, e cancela toda a cadência automática que estava rodando pra esse lead. O vendedor só precisa olhar pra coluna "Responderam" e priorizar.

## Antes de começar

Você precisa de:

- WhatsApp **conectado** (mesmo pré-requisito dos outros tutoriais).
- Um board com **pelo menos dois estágios** — um onde o lead "espera" (ex.: "Aguardando resposta") e um onde "respondeu" (ex.: "Em conversa", "Quente", "Qualificando").

## Como funciona por baixo

O CRM recebe via webhook toda mensagem que chega pelo WhatsApp. Quando uma mensagem chega de um número que está vinculado a um deal, o sistema dispara o gatilho `response_received` pra esse deal.

Aí ele faz duas coisas:

1. **Cancela todas as cadências automáticas pendentes pro deal** — porque agora tem humano respondendo, não faz sentido continuar mandando follow-up automático em cima.
2. **Executa as ações configuradas com gatilho "Quando o lead responde"** — incluindo, se você configurar, mover de estágio.

## Passo a passo

### 1. Vá em Automações

Menu lateral → **Automações**.

### 2. Clique em "+ Nova regra"

### 3. Dê um nome bem claro

Algo tipo `Lead respondeu → mover para Em conversa`. O nome aparece nos logs de execução, então quanto mais óbvio, melhor.

### 4. Escolha o board

Mesmo board onde os leads estão esperando. Cada board pode ter sua própria regra (porque os estágios são diferentes).

### 5. Gatilho: "Quando o lead responde"

Esse é o gatilho `response_received`. Ele dispara só quando vem uma mensagem **do lead pra empresa**, não o contrário.

### 6. Ação: "Mover para outro estágio"

Esse é o action `move_stage`.

### 7. Escolha o estágio de destino

No dropdown **Estágio de destino**, selecione pra onde os cards vão quando o lead responde. Boas opções:

- "Em conversa" / "Conversando"
- "Qualificando"
- "Quente"
- "Aguardando vendedor"

A ideia é que esse estágio seja **a próxima ação que o vendedor precisa fazer**. Não jogue pra "Fechado" ou "Ganho" — isso só acontece quando o vendedor decide.

### 8. Clique em "Criar regra"

Pronto. De agora em diante, cada vez que um lead manda mensagem, o card pula sozinho pra coluna que você escolheu.

## Combinando com a regra de boas-vindas

A combinação que funciona melhor na prática:

1. **Regra A** — "Lead novo → manda WhatsApp de boas-vindas" (artigo anterior)
2. **Regra B** — "Lead respondeu → move pra Em conversa" (este artigo)

Aí o fluxo fica:

- Lead chega no board → regra A manda mensagem automática
- Vendedor não precisa fazer nada nas próximas horas
- Quando o lead responde → regra B move o card pra "Em conversa"
- Vendedor abre só os cards de "Em conversa" e responde com calma

Isso reduz drasticamente o tempo perdido olhando cards que ainda não responderam.

## Cancelamento de cadência

Detalhe importante: **se você tem cadência de follow-up configurada** ("Mandar lembrete depois de 2 dias", "Mandar oferta depois de 4 dias"), o gatilho `response_received` **cancela tudo que estava agendado** pra esse deal. Faz sentido — o lead respondeu, parou de ser um caso de cadência fria, agora é um caso de conversa humana. Você não quer que daqui a 2 dias o CRM mande um "Ainda está com dúvida?" se a pessoa já está conversando.

## Testando

1. Crie um deal de teste com seu próprio número de WhatsApp
2. Confirme que o card está no estágio "Aguardando resposta" (ou similar)
3. Mande uma mensagem **do seu WhatsApp pessoal pro número do CRM** (qualquer texto, ex.: "oi")
4. Em poucos segundos o card deve pular pro estágio de destino

Se não pular, verifique:

- A regra está **Ativa** na lista
- O board está correto
- O webhook do WhatsApp está chegando — em **Configurações → Diagnóstico** existe um log de webhooks recentes

## Erros comuns

**O card não move** — Confira se o número de telefone do contato bate com o número que mandou a mensagem. Diferenças no formato (com ou sem 9, com ou sem código do país) podem fazer o sistema não achar o deal.

**Move o card mas a cadência não cancela** — Bug raro. Reporte na central de ajuda.

**Move pro estágio errado** — Você tem mais de uma regra de `response_received` no mesmo board? Elas executam todas. Deixe só uma com `move_stage`.

## Variantes úteis

Outros pares trigger + action que valem a pena:

- **`response_received` + `send_whatsapp`** — manda uma resposta automática de "obrigado, já vou te chamar". Útil pra dar feedback rápido enquanto o vendedor não conecta.
- **`days_in_stage` (3 dias) + `send_whatsapp`** — se ninguém respondeu em 3 dias, manda follow-up automático.
- **`days_in_stage` (7 dias) + `move_stage` (Perdido)** — se ainda não respondeu em 7 dias, considere perdido e tira do funil ativo.

Combinando esses 4 gatilhos você cobre 90% dos casos de gestão automática de funil.
$content$,
  'whatsapp',
  ARRAY['automação', 'response_received', 'mover stage', 'kanban', 'tutorial', 'passo a passo']
)
ON CONFLICT (slug) DO UPDATE
  SET title = EXCLUDED.title,
      content_md = EXCLUDED.content_md,
      tags = EXCLUDED.tags,
      updated_at = now();
