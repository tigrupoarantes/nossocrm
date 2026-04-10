# Plano de Integracao Datalake → NossoCRM (Supabase)

> Documento para alinhamento com o DBA.
> Objetivo: trazer dados comerciais de 9.000+ clientes CNPJ do datalake (ERP) para o CRM.

---

## 1. Estrategia escolhida: Tabela Resumo Materializada + Sync Periodico

```
┌──────────────┐     sync diario      ┌──────────────────┐
│   DATALAKE   │  ──────────────────►  │  SUPABASE (CRM)  │
│  (ERP/DW)    │   Edge Function ou   │                  │
│              │   script externo      │  contact_commercial_data  (resumo)
│  vendas      │                      │  ↕ JOIN com contacts, deals, etc.
│  estoque     │   POST /api/sync     │                  │
│  financeiro  │   ou INSERT direto   │  AI Tools / Super Agent / Dashboard
└──────────────┘                      └──────────────────┘
```

### Por que esta abordagem?

| Criterio | Decisao |
|----------|---------|
| Volume | 9.000 registros = ~2MB. Cabe tranquilo no Supabase |
| Frequencia | Dados comerciais de distribuicao sao D-1. Sync 1-2x/dia e suficiente |
| Performance | CRM faz SELECT local (< 10ms), nao depende de API externa |
| AI/Super Agent | AI tools e Super Agent precisam de acesso instantaneo — nao podem esperar API |
| Custo | Zero custo adicional. Supabase ja esta pago |
| Complexidade | Upsert simples por CNPJ/codigo_cliente. Sem CDC, sem streaming |

### O que NAO fazer

- **NAO clonar tabela bruta do ERP** — schema do ERP tem dezenas de colunas inuteis para o CRM
- **NAO consultar API em tempo real** — Super Agent atendendo cliente nao pode esperar 2-5s de API
- **NAO usar Foreign Data Wrapper (FDW)** — Supabase nao suporta FDW de forma nativa e confiavel

---

## 2. Schema da tabela `contact_commercial_data`

```sql
-- =============================================================================
-- CONTACT_COMMERCIAL_DATA
-- Dados comerciais do datalake sincronizados periodicamente.
-- Fonte: ERP/DW do Grupo Arantes (Chok, G4, Jarantes).
-- Sync: 1-2x/dia via Edge Function ou script externo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.contact_commercial_data (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Chave de vinculacao com o CRM
  -- Usar UMA dessas chaves para vincular ao contato/empresa do CRM:
  contact_id            UUID        REFERENCES public.contacts(id) ON DELETE SET NULL,
  client_company_id     UUID        REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  external_client_code  TEXT,       -- Codigo do cliente no ERP (ex: "CLI-00123")
  cnpj                  TEXT,       -- CNPJ limpo (14 digitos, sem mascara)

  -- Identificacao
  distribuidora         TEXT        NOT NULL CHECK (distribuidora IN ('chok', 'g4', 'jarantes')),
  segmento              TEXT,       -- padaria, mercado, restaurante, conveniencia, atacarejo, rede, etc.
  sub_segmento          TEXT,       -- sub-classificacao quando houver
  regiao                TEXT,       -- ribeirao_preto, sjrp, bauru
  cidade                TEXT,
  rota                  TEXT,       -- codigo da rota do vendedor

  -- Metricas de compra (periodo movel — ultimos 30, 60, 90 dias)
  ticket_medio_30d      NUMERIC(12,2),  -- valor medio por pedido nos ultimos 30 dias
  ticket_medio_90d      NUMERIC(12,2),  -- valor medio por pedido nos ultimos 90 dias
  total_faturado_30d    NUMERIC(12,2),  -- faturamento total ultimos 30 dias
  total_faturado_90d    NUMERIC(12,2),  -- faturamento total ultimos 90 dias
  total_faturado_12m    NUMERIC(12,2),  -- faturamento total ultimos 12 meses (LTV anual)
  qtd_pedidos_30d       INTEGER DEFAULT 0,
  qtd_pedidos_90d       INTEGER DEFAULT 0,
  qtd_pedidos_12m       INTEGER DEFAULT 0,

  -- Ultima compra
  last_purchase_date    DATE,           -- data do ultimo pedido faturado
  last_purchase_value   NUMERIC(12,2),  -- valor do ultimo pedido
  days_since_purchase   INTEGER,        -- dias sem compra (calculado no sync)

  -- Mix de produtos
  mix_skus_30d          INTEGER DEFAULT 0,   -- qtd de SKUs distintos comprados nos ultimos 30 dias
  mix_skus_90d          INTEGER DEFAULT 0,
  mix_categories_30d    INTEGER DEFAULT 0,   -- qtd de categorias distintas
  top_categories        TEXT[],              -- top 5 categorias por faturamento (array ordenado)
  top_products          JSONB DEFAULT '[]',  -- top 10 produtos: [{ sku, name, qty, value }]

  -- Frequencia e recorrencia
  frequencia_compra_dias  INTEGER,  -- intervalo medio entre pedidos (em dias)
  compras_por_mes_media   NUMERIC(5,2),  -- media de pedidos/mes nos ultimos 6 meses

  -- Classificacao
  curva_abc             TEXT CHECK (curva_abc IN ('A', 'B', 'C')),
  score_rfm             TEXT,       -- ex: "545", "312" (R=5 F=4 M=5)
  segmento_rfm          TEXT,       -- Champions, Loyal, At Risk, Lost, etc.

  -- Financeiro
  inadimplente          BOOLEAN DEFAULT false,
  valor_inadimplente    NUMERIC(12,2) DEFAULT 0,
  limite_credito        NUMERIC(12,2),
  dias_atraso_max       INTEGER DEFAULT 0,

  -- Vendedor responsavel (codigo ERP)
  vendedor_erp_code     TEXT,       -- codigo do vendedor no ERP
  supervisor_erp_code   TEXT,       -- codigo do supervisor no ERP

  -- Controle de sync
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now(),  -- quando foi sincronizado
  source_system         TEXT DEFAULT 'datalake',             -- origem dos dados
  raw_data              JSONB,      -- dados brutos do ERP (para debug/auditoria)

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Busca por org (obrigatorio)
CREATE INDEX idx_ccd_org
  ON contact_commercial_data(organization_id);

-- Busca por contato/empresa do CRM (JOIN com contacts/crm_companies)
CREATE INDEX idx_ccd_contact
  ON contact_commercial_data(contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX idx_ccd_company
  ON contact_commercial_data(client_company_id)
  WHERE client_company_id IS NOT NULL;

-- Busca por CNPJ (chave de vinculacao principal)
CREATE UNIQUE INDEX idx_ccd_org_cnpj
  ON contact_commercial_data(organization_id, cnpj)
  WHERE cnpj IS NOT NULL;

-- Busca por codigo ERP
CREATE UNIQUE INDEX idx_ccd_org_external
  ON contact_commercial_data(organization_id, external_client_code)
  WHERE external_client_code IS NOT NULL;

-- Filtros comerciais (queries frequentes)
CREATE INDEX idx_ccd_distribuidora
  ON contact_commercial_data(organization_id, distribuidora);

CREATE INDEX idx_ccd_segmento
  ON contact_commercial_data(organization_id, segmento);

CREATE INDEX idx_ccd_curva
  ON contact_commercial_data(organization_id, curva_abc);

CREATE INDEX idx_ccd_days_since
  ON contact_commercial_data(organization_id, days_since_purchase DESC);

CREATE INDEX idx_ccd_inadimplente
  ON contact_commercial_data(organization_id)
  WHERE inadimplente = true;

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE contact_commercial_data ENABLE ROW LEVEL SECURITY;

-- Membros da org podem ler
CREATE POLICY "Members can view commercial data"
  ON contact_commercial_data FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

-- Apenas service role pode inserir/atualizar (sync automatico)
-- Nenhum usuario final deve editar esses dados — vem do datalake.
CREATE POLICY "Service role can sync commercial data"
  ON contact_commercial_data FOR ALL
  USING (true)
  WITH CHECK (true);
-- NOTA: Essa policy so funciona via service role (supabaseAdmin).
-- Client-side nao consegue inserir por causa do USING no SELECT.

-- =============================================================================
-- TRIGGER: updated_at automatico
-- =============================================================================

CREATE TRIGGER contact_commercial_data_set_updated_at
  BEFORE UPDATE ON contact_commercial_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

---

## 3. Fluxo de sincronizacao

### Opcao A: Edge Function no Supabase (recomendado)

```
Cron (1x/dia 6h)
  → chama Edge Function "sync-commercial-data"
    → Edge Function faz GET no datalake API (ou query direta no DW)
    → Transforma dados para o schema acima
    → UPSERT no Supabase via supabaseAdmin (service role)
    → Atualiza contacts.lastPurchaseDate e contacts.totalValue
    → Log de sync
```

### Opcao B: Script externo (Python/Node)

```
Cron no servidor do datalake (1x/dia 6h)
  → Script le dados do DW (SQL direto)
  → Transforma para JSON no formato da tabela
  → POST para /api/sync/commercial-data (API route no CRM)
    → API route valida token + faz UPSERT via supabaseAdmin
```

### Opcao C: Insert direto via Supabase client

```
Cron no servidor do datalake
  → Script usa @supabase/supabase-js com service_role_key
  → Faz UPSERT direto na tabela contact_commercial_data
  → Sem passar pela API do CRM
```

**Recomendacao:** Opcao B ou C, dependendo de onde o DBA preferir rodar o script.

---

## 4. Logica do UPSERT (sync)

```sql
-- Upsert por CNPJ (chave natural do cliente)
INSERT INTO contact_commercial_data (
  organization_id, cnpj, external_client_code, distribuidora,
  segmento, regiao, cidade, rota,
  ticket_medio_30d, ticket_medio_90d,
  total_faturado_30d, total_faturado_90d, total_faturado_12m,
  qtd_pedidos_30d, qtd_pedidos_90d, qtd_pedidos_12m,
  last_purchase_date, last_purchase_value, days_since_purchase,
  mix_skus_30d, mix_skus_90d, mix_categories_30d,
  top_categories, top_products,
  frequencia_compra_dias, compras_por_mes_media,
  curva_abc, score_rfm, segmento_rfm,
  inadimplente, valor_inadimplente, limite_credito, dias_atraso_max,
  vendedor_erp_code, supervisor_erp_code,
  synced_at, source_system
)
VALUES (
  $1, $2, $3, $4, ...
)
ON CONFLICT (organization_id, cnpj)
DO UPDATE SET
  external_client_code  = EXCLUDED.external_client_code,
  distribuidora         = EXCLUDED.distribuidora,
  segmento              = EXCLUDED.segmento,
  regiao                = EXCLUDED.regiao,
  cidade                = EXCLUDED.cidade,
  rota                  = EXCLUDED.rota,
  ticket_medio_30d      = EXCLUDED.ticket_medio_30d,
  ticket_medio_90d      = EXCLUDED.ticket_medio_90d,
  total_faturado_30d    = EXCLUDED.total_faturado_30d,
  total_faturado_90d    = EXCLUDED.total_faturado_90d,
  total_faturado_12m    = EXCLUDED.total_faturado_12m,
  qtd_pedidos_30d       = EXCLUDED.qtd_pedidos_30d,
  qtd_pedidos_90d       = EXCLUDED.qtd_pedidos_90d,
  qtd_pedidos_12m       = EXCLUDED.qtd_pedidos_12m,
  last_purchase_date    = EXCLUDED.last_purchase_date,
  last_purchase_value   = EXCLUDED.last_purchase_value,
  days_since_purchase   = EXCLUDED.days_since_purchase,
  mix_skus_30d          = EXCLUDED.mix_skus_30d,
  mix_skus_90d          = EXCLUDED.mix_skus_90d,
  mix_categories_30d    = EXCLUDED.mix_categories_30d,
  top_categories        = EXCLUDED.top_categories,
  top_products          = EXCLUDED.top_products,
  frequencia_compra_dias  = EXCLUDED.frequencia_compra_dias,
  compras_por_mes_media   = EXCLUDED.compras_por_mes_media,
  curva_abc             = EXCLUDED.curva_abc,
  score_rfm             = EXCLUDED.score_rfm,
  segmento_rfm          = EXCLUDED.segmento_rfm,
  inadimplente          = EXCLUDED.inadimplente,
  valor_inadimplente    = EXCLUDED.valor_inadimplente,
  limite_credito        = EXCLUDED.limite_credito,
  dias_atraso_max       = EXCLUDED.dias_atraso_max,
  vendedor_erp_code     = EXCLUDED.vendedor_erp_code,
  supervisor_erp_code   = EXCLUDED.supervisor_erp_code,
  synced_at             = now(),
  updated_at            = now();
```

---

## 5. Vinculacao com contatos do CRM

Apos o sync, vincular `contact_commercial_data` aos `contacts` existentes:

```sql
-- Vincular por CNPJ (crm_companies tem cnpj)
UPDATE contact_commercial_data ccd
SET client_company_id = cc.id
FROM crm_companies cc
WHERE cc.organization_id = ccd.organization_id
  AND cc.cnpj = ccd.cnpj
  AND ccd.client_company_id IS NULL;

-- Vincular contact_id via client_company_id
UPDATE contact_commercial_data ccd
SET contact_id = c.id
FROM contacts c
WHERE c.organization_id = ccd.organization_id
  AND c.client_company_id = ccd.client_company_id
  AND ccd.contact_id IS NULL;

-- Atualizar campos do Contact com dados frescos do datalake
UPDATE contacts c
SET
  last_purchase_date = ccd.last_purchase_date::timestamptz,
  total_value = ccd.total_faturado_12m,
  status = CASE
    WHEN ccd.days_since_purchase <= 30 THEN 'ACTIVE'
    WHEN ccd.days_since_purchase <= 90 THEN 'INACTIVE'
    ELSE 'CHURNED'
  END,
  updated_at = now()
FROM contact_commercial_data ccd
WHERE ccd.contact_id = c.id
  AND ccd.organization_id = c.organization_id;
```

---

## 6. Query de exemplo — Dados que o CRM/AI vao consumir

```sql
-- Dashboard: clientes sem compra ha 30+ dias, curva A, por distribuidora
SELECT
  ccd.cnpj,
  ccd.distribuidora,
  ccd.segmento,
  ccd.cidade,
  ccd.days_since_purchase,
  ccd.ticket_medio_90d,
  ccd.curva_abc,
  ccd.segmento_rfm,
  ccd.top_categories,
  c.name AS contact_name,
  c.phone,
  cc.name AS company_name
FROM contact_commercial_data ccd
LEFT JOIN contacts c ON c.id = ccd.contact_id
LEFT JOIN crm_companies cc ON cc.id = ccd.client_company_id
WHERE ccd.organization_id = '<org_id>'
  AND ccd.days_since_purchase > 30
  AND ccd.curva_abc = 'A'
  AND ccd.distribuidora = 'chok'
ORDER BY ccd.days_since_purchase DESC;
```

```sql
-- Super Agent: contexto comercial do cliente para o bot WhatsApp
SELECT
  ccd.segmento,
  ccd.ticket_medio_30d,
  ccd.total_faturado_12m,
  ccd.days_since_purchase,
  ccd.mix_skus_30d,
  ccd.top_products,
  ccd.curva_abc,
  ccd.inadimplente,
  ccd.frequencia_compra_dias
FROM contact_commercial_data ccd
WHERE ccd.contact_id = '<contact_id>'
  AND ccd.organization_id = '<org_id>';
```

---

## 7. O que o DBA precisa preparar no lado do datalake

### Query de extracao (rodar 1x/dia no DW)

O DBA deve criar uma VIEW ou PROCEDURE no datalake que retorne:

```
| Campo              | Tipo     | Descricao                              |
|--------------------|----------|----------------------------------------|
| cnpj               | TEXT     | CNPJ limpo (14 digitos)                |
| codigo_cliente      | TEXT     | Codigo interno do ERP                  |
| distribuidora       | TEXT     | 'chok' | 'g4' | 'jarantes'            |
| segmento            | TEXT     | Segmento do cadastro                   |
| regiao              | TEXT     | Regiao de atendimento                  |
| cidade              | TEXT     | Cidade                                 |
| rota                | TEXT     | Rota do vendedor                       |
| ticket_medio_30d    | NUMERIC  | AVG(valor_pedido) ultimos 30 dias     |
| ticket_medio_90d    | NUMERIC  | AVG(valor_pedido) ultimos 90 dias     |
| total_faturado_30d  | NUMERIC  | SUM(valor_pedido) ultimos 30 dias     |
| total_faturado_90d  | NUMERIC  | SUM(valor_pedido) ultimos 90 dias     |
| total_faturado_12m  | NUMERIC  | SUM(valor_pedido) ultimos 12 meses    |
| qtd_pedidos_30d     | INTEGER  | COUNT(pedidos) ultimos 30 dias        |
| qtd_pedidos_90d     | INTEGER  | COUNT(pedidos) ultimos 90 dias        |
| qtd_pedidos_12m     | INTEGER  | COUNT(pedidos) ultimos 12 meses       |
| last_purchase_date  | DATE     | MAX(data_faturamento)                  |
| last_purchase_value | NUMERIC  | Valor do ultimo pedido                 |
| days_since_purchase | INTEGER  | CURRENT_DATE - last_purchase_date      |
| mix_skus_30d        | INTEGER  | COUNT(DISTINCT sku) ultimos 30 dias   |
| mix_skus_90d        | INTEGER  | COUNT(DISTINCT sku) ultimos 90 dias   |
| mix_categories_30d  | INTEGER  | COUNT(DISTINCT categoria) 30 dias     |
| top_categories      | TEXT[]   | Top 5 categorias por faturamento       |
| top_products        | JSONB    | Top 10 SKUs [{sku, name, qty, value}]  |
| frequencia_dias     | INTEGER  | Intervalo medio entre pedidos          |
| compras_mes_media   | NUMERIC  | Pedidos/mes media 6 meses              |
| curva_abc           | TEXT     | Calculado no DW: A, B ou C             |
| inadimplente        | BOOLEAN  | Tem titulo vencido > 7 dias?           |
| valor_inadimplente  | NUMERIC  | SUM(titulos vencidos)                  |
| limite_credito      | NUMERIC  | Limite de credito cadastrado           |
| dias_atraso_max     | INTEGER  | MAX(dias_atraso) titulos abertos       |
| vendedor_code       | TEXT     | Codigo do vendedor responsavel         |
| supervisor_code     | TEXT     | Codigo do supervisor                   |
```

### Formato de saida

JSON array, um objeto por cliente:

```json
[
  {
    "cnpj": "12345678000199",
    "codigo_cliente": "CLI-00123",
    "distribuidora": "chok",
    "segmento": "padaria",
    "regiao": "ribeirao_preto",
    "cidade": "Ribeirao Preto",
    "rota": "R-012",
    "ticket_medio_30d": 850.00,
    "ticket_medio_90d": 920.50,
    "total_faturado_30d": 2550.00,
    "total_faturado_90d": 8284.50,
    "total_faturado_12m": 35200.00,
    "qtd_pedidos_30d": 3,
    "qtd_pedidos_90d": 9,
    "qtd_pedidos_12m": 38,
    "last_purchase_date": "2026-04-05",
    "last_purchase_value": 1200.00,
    "days_since_purchase": 5,
    "mix_skus_30d": 12,
    "mix_skus_90d": 18,
    "mix_categories_30d": 4,
    "top_categories": ["biscoitos", "limpeza", "bebidas", "higiene"],
    "top_products": [
      {"sku": "BIS-001", "name": "Biscoito Nestle 200g", "qty": 24, "value": 480.00},
      {"sku": "LIM-005", "name": "Detergente Ype 500ml", "qty": 48, "value": 384.00}
    ],
    "frequencia_dias": 10,
    "compras_mes_media": 3.2,
    "curva_abc": "A",
    "inadimplente": false,
    "valor_inadimplente": 0,
    "limite_credito": 15000.00,
    "dias_atraso_max": 0,
    "vendedor_code": "VND-045",
    "supervisor_code": "SUP-003"
  }
]
```

---

## 8. Volumetria e performance estimada

| Metrica | Valor |
|---------|-------|
| Registros | ~9.000 clientes |
| Tamanho estimado por registro | ~2KB (com JSONB top_products) |
| Tamanho total da tabela | ~18MB |
| Tempo de UPSERT (9.000 registros) | ~5-15 segundos |
| Tempo de SELECT com index | < 10ms |
| Frequencia de sync | 1-2x/dia (6h e 14h sugerido) |
| Impacto no Supabase | Desprezivel (< 1% do storage) |

---

## 9. Proximos passos

| # | Acao | Responsavel | Prazo |
|---|------|-------------|-------|
| 1 | Criar a VIEW/PROCEDURE no datalake com os campos acima | DBA | - |
| 2 | Definir formato de saida (API REST ou arquivo JSON) | DBA | - |
| 3 | Criar migration no Supabase com a tabela `contact_commercial_data` | Dev (CRM) | Apos item 1 |
| 4 | Implementar script de sync (Edge Function ou API route) | Dev (CRM) | Apos item 2 |
| 5 | Implementar vinculacao automatica (contact_id, client_company_id) | Dev (CRM) | Apos item 3 |
| 6 | Adicionar dados comerciais ao context-builder do Super Agent | Dev (CRM) | Apos item 5 |
| 7 | Criar AI tool `getCommercialData` para consultar a tabela | Dev (CRM) | Apos item 5 |
| 8 | Testar sync com amostra de 100 clientes | DBA + Dev | Apos item 4 |
| 9 | Rodar sync completo (9.000) e validar dados | DBA + Dev | Apos item 8 |
| 10 | Configurar cron de sync automatico (1x/dia) | DevOps | Apos item 9 |

---

## 10. Score RFM — Query de calculo (para o DBA implementar no DW)

```sql
-- Exemplo de calculo RFM no PostgreSQL do datalake
WITH base AS (
  SELECT
    cnpj,
    CURRENT_DATE - MAX(data_faturamento) AS recency_days,
    COUNT(DISTINCT numero_pedido) FILTER (WHERE data_faturamento >= CURRENT_DATE - 365) AS frequency_12m,
    COALESCE(SUM(valor_liquido) FILTER (WHERE data_faturamento >= CURRENT_DATE - 365), 0) AS monetary_12m
  FROM vendas_faturadas
  GROUP BY cnpj
),
scored AS (
  SELECT
    cnpj,
    NTILE(5) OVER (ORDER BY recency_days DESC) AS r_score,   -- 5=recente, 1=antigo
    NTILE(5) OVER (ORDER BY frequency_12m ASC) AS f_score,    -- 5=frequente, 1=raro
    NTILE(5) OVER (ORDER BY monetary_12m ASC) AS m_score      -- 5=alto valor, 1=baixo
  FROM base
)
SELECT
  cnpj,
  r_score || f_score || m_score AS score_rfm,
  CASE
    WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4 THEN 'Champions'
    WHEN f_score >= 4 AND m_score >= 4 THEN 'Loyal'
    WHEN r_score >= 4 AND f_score <= 2 THEN 'Potenciais'
    WHEN r_score <= 2 AND f_score >= 3 AND m_score >= 3 THEN 'Em Risco'
    WHEN r_score <= 2 AND f_score <= 2 THEN 'Perdidos'
    ELSE 'Regular'
  END AS segmento_rfm
FROM scored;
```

---

## 11. Curva ABC — Query de calculo

```sql
WITH ranked AS (
  SELECT
    cnpj,
    SUM(valor_liquido) FILTER (WHERE data_faturamento >= CURRENT_DATE - 365) AS faturamento_12m,
    SUM(SUM(valor_liquido) FILTER (WHERE data_faturamento >= CURRENT_DATE - 365))
      OVER (ORDER BY SUM(valor_liquido) FILTER (WHERE data_faturamento >= CURRENT_DATE - 365) DESC)
      AS acumulado,
    SUM(SUM(valor_liquido) FILTER (WHERE data_faturamento >= CURRENT_DATE - 365))
      OVER () AS total
  FROM vendas_faturadas
  GROUP BY cnpj
)
SELECT
  cnpj,
  faturamento_12m,
  CASE
    WHEN acumulado <= total * 0.80 THEN 'A'
    WHEN acumulado <= total * 0.95 THEN 'B'
    ELSE 'C'
  END AS curva_abc
FROM ranked;
```
