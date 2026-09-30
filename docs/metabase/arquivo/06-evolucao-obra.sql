-- =====================================================================
-- DASHBOARD 6 — BARRA DE EVOLUÇÃO DE OBRA
--
-- A barra que você descreveu: 100% cinza (escopo), laranja até a data A,
-- azul do avanço entre A e B. No Metabase isso é UMA barra empilhada com
-- três séries que somam 100 — não três gráficos.
--
--   [======= laranja 30% =======][==== azul 30% ====][=== cinza 40% ===]
--    feito até a data A           avanço até a data B  falta
--
-- As duas datas são variáveis do Metabase ({{data_a}} e {{data_b}}),
-- então viram filtros do dashboard.
--
-- Este arquivo SÓ ADICIONA views. Nada do 00-views.sql é alterado —
-- mas ele depende delas, então rode 00-views.sql antes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- VIEWS NOVAS (rodar fora do Metabase, junto com 00-views.sql)
-- ---------------------------------------------------------------------

DROP VIEW IF EXISTS vw_frente_evolucao CASCADE;
DROP VIEW IF EXISTS vw_frente_medicoes CASCADE;

-- Uma linha por medição de cada frente. É o "histórico da obra".
CREATE VIEW vw_frente_medicoes AS
SELECT
  tag_set                       AS frente,
  tag_set_key,
  application_id,
  checklist,
  projeto,
  org_id,
  project_id,
  data,
  data::date                    AS dia,
  total_itens,
  itens_concluidos,
  COALESCE(pct_concluido, 0)    AS pct_concluido,
  status,
  fotos,
  ROW_NUMBER() OVER (PARTITION BY tag_set_key ORDER BY data DESC, created_at DESC) AS recencia
FROM vw_applications
WHERE tag_set <> '(sem tag)';

-- Última vs penúltima medição, já decomposta nas três faixas da barra.
-- Versão sem parâmetro: serve para um card que funciona sozinho.
CREATE VIEW vw_frente_evolucao AS
WITH b AS (SELECT * FROM vw_frente_medicoes WHERE recencia = 1),
     a AS (SELECT * FROM vw_frente_medicoes WHERE recencia = 2)
SELECT
  b.frente,
  b.tag_set_key,
  b.projeto,
  b.org_id,
  b.project_id,
  a.dia                                   AS data_anterior,
  b.dia                                   AS data_atual,
  COALESCE(a.pct_concluido, 0)            AS pct_anterior,
  b.pct_concluido                         AS pct_atual,
  b.total_itens,
  COALESCE(a.itens_concluidos, 0)         AS itens_anterior,
  b.itens_concluidos                      AS itens_atual,
  -- as três faixas, somando 100
  COALESCE(a.pct_concluido, 0)                                    AS faixa_feito_antes,
  GREATEST(b.pct_concluido - COALESCE(a.pct_concluido, 0), 0)     AS faixa_avanco,
  GREATEST(100 - GREATEST(b.pct_concluido, COALESCE(a.pct_concluido,0)), 0) AS faixa_falta
FROM b
LEFT JOIN a ON a.tag_set_key = b.tag_set_key;

-- ---------------------------------------------------------------------
-- CARDS  (estes sim vão no editor nativo do Metabase)
-- ---------------------------------------------------------------------

-- @card 6.1 — Barra de obra, duas datas variáveis  ★ o que você pediu
--
-- Metabase:
--   1. Cole no editor nativo. Vão aparecer duas variáveis na barra lateral:
--      data_a e data_b. Marque o tipo de ambas como "Date" e ponha um valor
--      padrão (ex.: data_a = 30 dias atrás, data_b = hoje).
--   2. Visualization → Bar (ou Row, para barra horizontal).
--   3. Em Display, ligue "Stack". Eixo Y de 0 a 100.
--   4. Em Settings → cores das séries:
--        "1 · feito até A"  → laranja   #EB6834
--        "2 · avanço A→B"   → azul      #2A78D6
--        "3 · falta"        → cinza     #D7DAE0
--   5. No dashboard, conecte dois filtros de data às variáveis.
--
-- A ordem das colunas é a ordem do empilhamento — não troque.
WITH ate_a AS (
  SELECT DISTINCT ON (tag_set_key)
         tag_set_key, frente, pct_concluido, itens_concluidos, total_itens, dia
  FROM vw_frente_medicoes
  WHERE dia <= {{data_a}}
  ORDER BY tag_set_key, data DESC
),
ate_b AS (
  SELECT DISTINCT ON (tag_set_key)
         tag_set_key, frente, pct_concluido, itens_concluidos, total_itens, dia
  FROM vw_frente_medicoes
  WHERE dia <= {{data_b}}
  ORDER BY tag_set_key, data DESC
)
SELECT
  COALESCE(b.frente, a.frente)                                      AS frente,
  ROUND(COALESCE(a.pct_concluido, 0), 1)                            AS "1 · feito até A",
  ROUND(GREATEST(COALESCE(b.pct_concluido,0) - COALESCE(a.pct_concluido,0), 0), 1) AS "2 · avanço A→B",
  ROUND(GREATEST(100 - GREATEST(COALESCE(b.pct_concluido,0), COALESCE(a.pct_concluido,0)), 0), 1) AS "3 · falta"
FROM ate_b b
FULL JOIN ate_a a ON a.tag_set_key = b.tag_set_key
ORDER BY COALESCE(b.pct_concluido, 0) DESC, frente;

-- @card 6.2 — A mesma barra, sem parâmetro (última vs penúltima medição)
--   Para quem só quer abrir e ver. Mesma configuração de cores do 6.1.
SELECT frente,
       ROUND(faixa_feito_antes, 1) AS "1 · feito antes",
       ROUND(faixa_avanco, 1)      AS "2 · avanço",
       ROUND(faixa_falta, 1)       AS "3 · falta"
FROM vw_frente_evolucao
ORDER BY faixa_avanco DESC;

-- @card 6.3 — Uma frente só, em itens (para "Progress" ou "Number")
--   Visualization → Progress, com meta = total_itens.
--   Variável {{frente}} do tipo Text, ligada a um filtro de dropdown.
SELECT frente,
       itens_atual        AS itens_concluidos,
       total_itens        AS meta,
       itens_anterior     AS itens_na_medicao_anterior,
       itens_atual - itens_anterior AS itens_ganhos,
       data_anterior,
       data_atual
FROM vw_frente_evolucao
-- [[ ]] é a sintaxe de cláusula opcional do Metabase: sem valor no filtro,
-- o trecho some e o card devolve todas as frentes.
WHERE 1 = 1 [[AND frente = {{frente}}]];

-- @card 6.4 — Linha do tempo da obra (área empilhada por mês)
--   Visualization → Area, Stack. Mostra o acumulado avançando mês a mês.
SELECT date_trunc('month', data)::date AS mes,
       frente,
       MAX(pct_concluido)              AS pct_concluido
FROM vw_frente_medicoes
GROUP BY 1, 2
ORDER BY 1;

-- @card 6.5 — Tabela de apoio da barra (conferir os números do 6.1)
SELECT frente,
       data_anterior, pct_anterior,
       data_atual,    pct_atual,
       ROUND(pct_atual - pct_anterior, 1) AS delta_pp,
       itens_anterior || ' → ' || itens_atual || ' de ' || total_itens AS itens
FROM vw_frente_evolucao
ORDER BY delta_pp DESC NULLS LAST;
