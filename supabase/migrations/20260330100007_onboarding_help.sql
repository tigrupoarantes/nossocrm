-- =============================================================================
-- ONBOARDING + CENTRAL DE AJUDA
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ONBOARDING_PROGRESS (progresso do onboarding por usuário)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  steps_completed  TEXT[]      NOT NULL DEFAULT '{}',
  completed_at     TIMESTAMPTZ,
  dismissed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_onboarding_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_org
  ON public.onboarding_progress (organization_id);

-- -----------------------------------------------------------------------------
-- 2. HELP_ARTICLES (artigos da central de ajuda)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.help_articles (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        REFERENCES public.organizations(id) ON DELETE CASCADE,  -- NULL = global
  title            TEXT        NOT NULL,
  slug             TEXT        NOT NULL,
  content_md       TEXT        NOT NULL,
  category         TEXT        NOT NULL,  -- 'whatsapp','crm','ia','prospecting','ads','general'
  tags             TEXT[]      NOT NULL DEFAULT '{}',
  views_count      INTEGER     NOT NULL DEFAULT 0,
  is_published     BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_help_article_slug UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_help_articles_category
  ON public.help_articles (category, is_published);

-- -----------------------------------------------------------------------------
-- 3. RLS POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_user ON public.onboarding_progress
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY help_articles_select ON public.help_articles
  FOR SELECT USING (
    is_published = true AND (
      organization_id IS NULL OR
      organization_id IN (
        SELECT organization_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 4. SEED — Artigos globais de ajuda
-- -----------------------------------------------------------------------------
INSERT INTO public.help_articles (title, slug, content_md, category, tags)
VALUES
(
  'Como conectar o WhatsApp ao NossoCRM',
  'como-conectar-whatsapp',
  E'# Como conectar o WhatsApp\n\nO NossoCRM usa a API WAHA para conectar o WhatsApp Business.\n\n## Passo a passo\n\n1. Acesse **Configurações → WhatsApp**\n2. Clique em **Adicionar instância**\n3. Informe o nome da instância e a URL da API\n4. Escaneie o **QR Code** com seu WhatsApp\n5. Aguarde a conexão ser estabelecida\n\n## Dicas\n\n- Use um número exclusivo para o CRM\n- Não use o mesmo número no app do WhatsApp enquanto conectado\n- O status "WORKING" indica conexão ativa',
  'whatsapp',
  ARRAY['conexão','qr code','waha']
),
(
  'Como criar seu primeiro funil de vendas',
  'criar-funil-vendas',
  E'# Criando seu primeiro funil\n\n## O que é um funil?\n\nUm funil (ou board) organiza seus negócios em estágios, do contato inicial ao fechamento.\n\n## Como criar\n\n1. Acesse **CRM → Funis**\n2. Clique em **Novo funil**\n3. Dê um nome (ex: "Vendas B2B")\n4. Adicione estágios arrastando ou clicando em **+ Estágio**\n5. Configure o percentual de chance em cada estágio\n\n## Dicas\n\n- Tenha no mínimo 5 estágios para um funil completo\n- Use cores para diferenciar estágios\n- Marque o último estágio como "Ganho"',
  'crm',
  ARRAY['funil','pipeline','negócios']
),
(
  'Configurando o Super Agente de IA',
  'configurar-super-agente',
  E'# Super Agente de IA\n\nO Super Agente responde automaticamente mensagens no WhatsApp usando IA.\n\n## Configuração básica\n\n1. Acesse **Super Agente → + Novo Agente**\n2. Defina um **nome** e **prompt do sistema**\n3. Escolha o **modelo de IA** (Gemini 2.0 Flash recomendado)\n4. Configure o **horário de funcionamento**\n5. Ative o agente com o toggle\n\n## Prompt de exemplo\n\n```\nVocê é um assistente de vendas da [EMPRESA]. \nResponda de forma amigável e profissional.\nSe o cliente quiser falar com humano, diga: TRANSFERIR\n```\n\n## Handoff para humano\n\nAdicione palavras-chave como "humano", "atendente", "pessoa" para transferir automaticamente.',
  'ia',
  ARRAY['agente','ia','whatsapp','automação']
),
(
  'Como prospectar novos clientes',
  'prospectar-clientes',
  E'# Prospecção de Clientes\n\nO módulo de prospecção busca empresas via Google Places e envia mensagens automáticas.\n\n## Como usar\n\n1. Acesse **Prospectar**\n2. Informe o **segmento** (ex: "restaurantes")\n3. Informe a **cidade** (ex: "São Paulo")\n4. Clique em **Buscar leads**\n5. Revise a lista e clique em **Disparar mensagens**\n\n## Template de mensagem\n\nUse variáveis: `{nome}`, `{empresa}`, `{cidade}`, `{segmento}`\n\nExemplo:\n```\nOlá {nome}! Vi que vocês são {segmento} em {cidade}.\nGostaria de apresentar nossa solução. Posso te chamar?\n```\n\n## Delay recomendado\n\nUse no mínimo 60 segundos entre mensagens para evitar bloqueio.',
  'prospecting',
  ARRAY['prospecção','leads','disparo','whatsapp']
),
(
  'Configurando Facebook Ads e CAPI',
  'facebook-ads-capi',
  E'# Facebook Ads e Conversions API\n\n## Conectar conta de anúncios\n\n1. Acesse **Conexões → Anúncios**\n2. Clique em **Conectar com Facebook**\n3. Autorize o acesso às suas contas\n4. Suas campanhas serão sincronizadas automaticamente\n\n## Configurar CAPI\n\nA Conversions API envia eventos server-side para melhorar a atribuição.\n\n1. Acesse **Configurações → Facebook CAPI**\n2. Informe o **Pixel ID** e **Token de Acesso**\n3. Eventos enviados automaticamente:\n   - Deal ganho → `Purchase`\n   - Novo contato → `Lead`\n   - Nova conversa → `Contact`\n\n## Benefícios do CAPI\n\n- Rastreamento sem cookies\n- Funciona com Ad Blockers\n- Melhora a atribuição de conversões',
  'ads',
  ARRAY['facebook','ads','capi','pixel','conversões']
)
ON CONFLICT (slug) DO NOTHING;
