-- ---------------------------------------------------------------------
-- DASHBOARD 6 — BARRA DE EVOLUÇÃO DE OBRA
-- VERSÃO STANDALONE — cole um card inteiro no editor nativo do Metabase.
-- Não precisa criar view nenhuma: o bloco WITH no topo de cada card é a
-- própria definição das views, embutida. Cada card é UM SELECT só, que é
-- o único formato que o editor nativo aceita.
-- ---------------------------------------------------------------------


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

-- DROP VIEW IF EXISTS vw_frente_evolucao CASCADE;
-- DROP VIEW IF EXISTS vw_frente_medicoes CASCADE;

-- Uma linha por medição de cada frente. É o "histórico da obra".
-- CREATE VIEW vw_frente_medicoes AS
-- SELECT
--   tag_set                       AS frente,
--   tag_set_key,
--   application_id,
--   checklist,
--   projeto,
--   org_id,
--   project_id,
--   data,
--   data::date                    AS dia,
--   total_itens,
--   itens_concluidos,
--   COALESCE(pct_concluido, 0)    AS pct_concluido,
--   status,
--   fotos,
--   ROW_NUMBER() OVER (PARTITION BY tag_set_key ORDER BY data DESC, created_at DESC) AS recencia
-- FROM vw_applications
-- WHERE tag_set <> '(sem tag)';

-- Última vs penúltima medição, já decomposta nas três faixas da barra.
-- Versão sem parâmetro: serve para um card que funciona sozinho.
-- CREATE VIEW vw_frente_evolucao AS
-- WITH b AS (SELECT * FROM vw_frente_medicoes WHERE recencia = 1),
--      a AS (SELECT * FROM vw_frente_medicoes WHERE recencia = 2)
-- SELECT
--   b.frente,
--   b.tag_set_key,
--   b.projeto,
--   b.org_id,
--   b.project_id,
--   a.dia                                   AS data_anterior,
--   b.dia                                   AS data_atual,
--   COALESCE(a.pct_concluido, 0)            AS pct_anterior,
--   b.pct_concluido                         AS pct_atual,
--   b.total_itens,
--   COALESCE(a.itens_concluidos, 0)         AS itens_anterior,
--   b.itens_concluidos                      AS itens_atual,
  -- as três faixas, somando 100
--   COALESCE(a.pct_concluido, 0)                                    AS faixa_feito_antes,
--   GREATEST(b.pct_concluido - COALESCE(a.pct_concluido, 0), 0)     AS faixa_avanco,
--   GREATEST(100 - GREATEST(b.pct_concluido, COALESCE(a.pct_concluido,0)), 0) AS faixa_falta
-- FROM b
-- LEFT JOIN a ON a.tag_set_key = b.tag_set_key;

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
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_application_tags AS (
  SELECT a.id      AS application_id,
         a.org_id,
         tid       AS tag_id,
         COALESCE(t.label, '(tag removida)') AS tag
  FROM applications a
  CROSS JOIN LATERAL unnest(a.tags_ids) AS tid
  LEFT JOIN tags t ON t.id = tid
),
vw_application_items AS (
  SELECT
    ai.id                       AS item_id,
    ai.application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title                     AS checklist,
    a.status                    AS status_aplicacao,
    a.date                      AS data_aplicacao,
    ai.position,
    ai.title                    AS item_titulo,
    NULLIF(split_part(ai.title, ': ', 1), ai.title) AS grupo,
    ai.answer                   AS resposta,
    os.semantic,
    ai.answer <> ''                              AS respondido,
    COALESCE(os.semantic = 'positivo', FALSE)    AS concluido,
    COALESCE(os.semantic = 'negativo', FALSE)    AS nao_conforme,
    COALESCE(os.semantic = 'neutro',   FALSE)    AS parcial,
    ai.workflow_status,
    ai.answered_at,
    ai.note,
    ai.note <> ''               AS tem_nota,
    ai.quantity                 AS quantidade,
    ai.suggested,
    ai.suggestion_source,
    ai.tags_ids                 AS item_tags_ids,
    ai.created_at,
    ai.updated_at,
    (SELECT count(*) FROM attachments att WHERE att.application_item_id = ai.id) AS fotos
  FROM application_items ai
  JOIN applications a ON a.id = ai.application_id
  JOIN checklists   c ON c.id = a.checklist_id
  LEFT JOIN vw_checklist_option_semantics os
         ON os.checklist_id = a.checklist_id
        AND os.label        = ai.answer
),
vw_applications AS (
  WITH agg AS (
    SELECT application_id,
           count(*)                                          AS total_itens,
           count(*) FILTER (WHERE respondido)                AS itens_respondidos,
           count(*) FILTER (WHERE concluido)                 AS itens_concluidos,
           count(*) FILTER (WHERE nao_conforme)              AS itens_nao_conformes,
           count(*) FILTER (WHERE parcial)                   AS itens_parciais,
           count(*) FILTER (WHERE NOT respondido)            AS itens_pendentes,
           count(*) FILTER (WHERE workflow_status IS NOT NULL
                              AND NOT respondido)            AS itens_em_workflow,
           count(*) FILTER (WHERE tem_nota)                  AS itens_com_nota,
           COALESCE(sum(fotos), 0)                           AS fotos,
           min(answered_at)                                  AS primeira_resposta,
           max(answered_at)                                  AS ultima_resposta
    FROM vw_application_items
    GROUP BY 1
  )
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    p.name              AS projeto,
    a.checklist_id,
    c.title             AS checklist,
    a.status,
    a.date              AS data,
    a.created_at,
    a.updated_at,
    COALESCE(a.completed_at,
             CASE WHEN a.status = 'completed' THEN a.updated_at END) AS concluida_em,
    a.transcript IS NOT NULL                    AS usou_voz,
    a.gallery_source_application_id IS NOT NULL AS repetida_de_outra,
    a.tags_ids,
    -- chave estável do conjunto de tags: é isto que agrupa "a mesma coisa"
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE(
      (SELECT string_agg(vt.tag, ' · ' ORDER BY vt.tag)
       FROM vw_application_tags vt WHERE vt.application_id = a.id),
      '(sem tag)')                              AS tag_set,
    COALESCE(agg.total_itens, 0)        AS total_itens,
    COALESCE(agg.itens_respondidos, 0)  AS itens_respondidos,
    COALESCE(agg.itens_concluidos, 0)   AS itens_concluidos,
    COALESCE(agg.itens_nao_conformes,0) AS itens_nao_conformes,
    COALESCE(agg.itens_parciais, 0)     AS itens_parciais,
    COALESCE(agg.itens_pendentes, 0)    AS itens_pendentes,
    COALESCE(agg.itens_em_workflow, 0)  AS itens_em_workflow,
    COALESCE(agg.itens_com_nota, 0)     AS itens_com_nota,
    COALESCE(agg.fotos, 0)              AS fotos,
    agg.primeira_resposta,
    agg.ultima_resposta,
    ROUND(100.0 * COALESCE(agg.itens_concluidos,0)
          / NULLIF(agg.total_itens, 0), 1)      AS pct_concluido,
    ROUND(100.0 * COALESCE(agg.itens_respondidos,0)
          / NULLIF(agg.total_itens, 0), 1)      AS pct_respondido,
    ROUND(EXTRACT(EPOCH FROM (agg.ultima_resposta - agg.primeira_resposta))/60.0, 1)
                                                AS minutos_em_campo
  FROM applications a
  JOIN checklists c  ON c.id = a.checklist_id
  LEFT JOIN projects p ON p.id = c.project_id
  LEFT JOIN agg ON agg.application_id = a.id
),
vw_frente_medicoes AS (
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
  WHERE tag_set <> '(sem tag)'
),
vw_frente_evolucao AS (
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
  LEFT JOIN a ON a.tag_set_key = b.tag_set_key
),
ate_a AS (
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
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_application_tags AS (
  SELECT a.id      AS application_id,
         a.org_id,
         tid       AS tag_id,
         COALESCE(t.label, '(tag removida)') AS tag
  FROM applications a
  CROSS JOIN LATERAL unnest(a.tags_ids) AS tid
  LEFT JOIN tags t ON t.id = tid
),
vw_application_items AS (
  SELECT
    ai.id                       AS item_id,
    ai.application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title                     AS checklist,
    a.status                    AS status_aplicacao,
    a.date                      AS data_aplicacao,
    ai.position,
    ai.title                    AS item_titulo,
    NULLIF(split_part(ai.title, ': ', 1), ai.title) AS grupo,
    ai.answer                   AS resposta,
    os.semantic,
    ai.answer <> ''                              AS respondido,
    COALESCE(os.semantic = 'positivo', FALSE)    AS concluido,
    COALESCE(os.semantic = 'negativo', FALSE)    AS nao_conforme,
    COALESCE(os.semantic = 'neutro',   FALSE)    AS parcial,
    ai.workflow_status,
    ai.answered_at,
    ai.note,
    ai.note <> ''               AS tem_nota,
    ai.quantity                 AS quantidade,
    ai.suggested,
    ai.suggestion_source,
    ai.tags_ids                 AS item_tags_ids,
    ai.created_at,
    ai.updated_at,
    (SELECT count(*) FROM attachments att WHERE att.application_item_id = ai.id) AS fotos
  FROM application_items ai
  JOIN applications a ON a.id = ai.application_id
  JOIN checklists   c ON c.id = a.checklist_id
  LEFT JOIN vw_checklist_option_semantics os
         ON os.checklist_id = a.checklist_id
        AND os.label        = ai.answer
),
vw_applications AS (
  WITH agg AS (
    SELECT application_id,
           count(*)                                          AS total_itens,
           count(*) FILTER (WHERE respondido)                AS itens_respondidos,
           count(*) FILTER (WHERE concluido)                 AS itens_concluidos,
           count(*) FILTER (WHERE nao_conforme)              AS itens_nao_conformes,
           count(*) FILTER (WHERE parcial)                   AS itens_parciais,
           count(*) FILTER (WHERE NOT respondido)            AS itens_pendentes,
           count(*) FILTER (WHERE workflow_status IS NOT NULL
                              AND NOT respondido)            AS itens_em_workflow,
           count(*) FILTER (WHERE tem_nota)                  AS itens_com_nota,
           COALESCE(sum(fotos), 0)                           AS fotos,
           min(answered_at)                                  AS primeira_resposta,
           max(answered_at)                                  AS ultima_resposta
    FROM vw_application_items
    GROUP BY 1
  )
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    p.name              AS projeto,
    a.checklist_id,
    c.title             AS checklist,
    a.status,
    a.date              AS data,
    a.created_at,
    a.updated_at,
    COALESCE(a.completed_at,
             CASE WHEN a.status = 'completed' THEN a.updated_at END) AS concluida_em,
    a.transcript IS NOT NULL                    AS usou_voz,
    a.gallery_source_application_id IS NOT NULL AS repetida_de_outra,
    a.tags_ids,
    -- chave estável do conjunto de tags: é isto que agrupa "a mesma coisa"
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE(
      (SELECT string_agg(vt.tag, ' · ' ORDER BY vt.tag)
       FROM vw_application_tags vt WHERE vt.application_id = a.id),
      '(sem tag)')                              AS tag_set,
    COALESCE(agg.total_itens, 0)        AS total_itens,
    COALESCE(agg.itens_respondidos, 0)  AS itens_respondidos,
    COALESCE(agg.itens_concluidos, 0)   AS itens_concluidos,
    COALESCE(agg.itens_nao_conformes,0) AS itens_nao_conformes,
    COALESCE(agg.itens_parciais, 0)     AS itens_parciais,
    COALESCE(agg.itens_pendentes, 0)    AS itens_pendentes,
    COALESCE(agg.itens_em_workflow, 0)  AS itens_em_workflow,
    COALESCE(agg.itens_com_nota, 0)     AS itens_com_nota,
    COALESCE(agg.fotos, 0)              AS fotos,
    agg.primeira_resposta,
    agg.ultima_resposta,
    ROUND(100.0 * COALESCE(agg.itens_concluidos,0)
          / NULLIF(agg.total_itens, 0), 1)      AS pct_concluido,
    ROUND(100.0 * COALESCE(agg.itens_respondidos,0)
          / NULLIF(agg.total_itens, 0), 1)      AS pct_respondido,
    ROUND(EXTRACT(EPOCH FROM (agg.ultima_resposta - agg.primeira_resposta))/60.0, 1)
                                                AS minutos_em_campo
  FROM applications a
  JOIN checklists c  ON c.id = a.checklist_id
  LEFT JOIN projects p ON p.id = c.project_id
  LEFT JOIN agg ON agg.application_id = a.id
),
vw_frente_medicoes AS (
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
  WHERE tag_set <> '(sem tag)'
),
vw_frente_evolucao AS (
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
  LEFT JOIN a ON a.tag_set_key = b.tag_set_key
)
SELECT frente,
       ROUND(faixa_feito_antes, 1) AS "1 · feito antes",
       ROUND(faixa_avanco, 1)      AS "2 · avanço",
       ROUND(faixa_falta, 1)       AS "3 · falta"
FROM vw_frente_evolucao
ORDER BY faixa_avanco DESC;

-- @card 6.3 — Uma frente só, em itens (para "Progress" ou "Number")
--   Visualization → Progress, com meta = total_itens.
--   Variável {{frente}} do tipo Text, ligada a um filtro de dropdown.
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_application_tags AS (
  SELECT a.id      AS application_id,
         a.org_id,
         tid       AS tag_id,
         COALESCE(t.label, '(tag removida)') AS tag
  FROM applications a
  CROSS JOIN LATERAL unnest(a.tags_ids) AS tid
  LEFT JOIN tags t ON t.id = tid
),
vw_application_items AS (
  SELECT
    ai.id                       AS item_id,
    ai.application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title                     AS checklist,
    a.status                    AS status_aplicacao,
    a.date                      AS data_aplicacao,
    ai.position,
    ai.title                    AS item_titulo,
    NULLIF(split_part(ai.title, ': ', 1), ai.title) AS grupo,
    ai.answer                   AS resposta,
    os.semantic,
    ai.answer <> ''                              AS respondido,
    COALESCE(os.semantic = 'positivo', FALSE)    AS concluido,
    COALESCE(os.semantic = 'negativo', FALSE)    AS nao_conforme,
    COALESCE(os.semantic = 'neutro',   FALSE)    AS parcial,
    ai.workflow_status,
    ai.answered_at,
    ai.note,
    ai.note <> ''               AS tem_nota,
    ai.quantity                 AS quantidade,
    ai.suggested,
    ai.suggestion_source,
    ai.tags_ids                 AS item_tags_ids,
    ai.created_at,
    ai.updated_at,
    (SELECT count(*) FROM attachments att WHERE att.application_item_id = ai.id) AS fotos
  FROM application_items ai
  JOIN applications a ON a.id = ai.application_id
  JOIN checklists   c ON c.id = a.checklist_id
  LEFT JOIN vw_checklist_option_semantics os
         ON os.checklist_id = a.checklist_id
        AND os.label        = ai.answer
),
vw_applications AS (
  WITH agg AS (
    SELECT application_id,
           count(*)                                          AS total_itens,
           count(*) FILTER (WHERE respondido)                AS itens_respondidos,
           count(*) FILTER (WHERE concluido)                 AS itens_concluidos,
           count(*) FILTER (WHERE nao_conforme)              AS itens_nao_conformes,
           count(*) FILTER (WHERE parcial)                   AS itens_parciais,
           count(*) FILTER (WHERE NOT respondido)            AS itens_pendentes,
           count(*) FILTER (WHERE workflow_status IS NOT NULL
                              AND NOT respondido)            AS itens_em_workflow,
           count(*) FILTER (WHERE tem_nota)                  AS itens_com_nota,
           COALESCE(sum(fotos), 0)                           AS fotos,
           min(answered_at)                                  AS primeira_resposta,
           max(answered_at)                                  AS ultima_resposta
    FROM vw_application_items
    GROUP BY 1
  )
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    p.name              AS projeto,
    a.checklist_id,
    c.title             AS checklist,
    a.status,
    a.date              AS data,
    a.created_at,
    a.updated_at,
    COALESCE(a.completed_at,
             CASE WHEN a.status = 'completed' THEN a.updated_at END) AS concluida_em,
    a.transcript IS NOT NULL                    AS usou_voz,
    a.gallery_source_application_id IS NOT NULL AS repetida_de_outra,
    a.tags_ids,
    -- chave estável do conjunto de tags: é isto que agrupa "a mesma coisa"
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE(
      (SELECT string_agg(vt.tag, ' · ' ORDER BY vt.tag)
       FROM vw_application_tags vt WHERE vt.application_id = a.id),
      '(sem tag)')                              AS tag_set,
    COALESCE(agg.total_itens, 0)        AS total_itens,
    COALESCE(agg.itens_respondidos, 0)  AS itens_respondidos,
    COALESCE(agg.itens_concluidos, 0)   AS itens_concluidos,
    COALESCE(agg.itens_nao_conformes,0) AS itens_nao_conformes,
    COALESCE(agg.itens_parciais, 0)     AS itens_parciais,
    COALESCE(agg.itens_pendentes, 0)    AS itens_pendentes,
    COALESCE(agg.itens_em_workflow, 0)  AS itens_em_workflow,
    COALESCE(agg.itens_com_nota, 0)     AS itens_com_nota,
    COALESCE(agg.fotos, 0)              AS fotos,
    agg.primeira_resposta,
    agg.ultima_resposta,
    ROUND(100.0 * COALESCE(agg.itens_concluidos,0)
          / NULLIF(agg.total_itens, 0), 1)      AS pct_concluido,
    ROUND(100.0 * COALESCE(agg.itens_respondidos,0)
          / NULLIF(agg.total_itens, 0), 1)      AS pct_respondido,
    ROUND(EXTRACT(EPOCH FROM (agg.ultima_resposta - agg.primeira_resposta))/60.0, 1)
                                                AS minutos_em_campo
  FROM applications a
  JOIN checklists c  ON c.id = a.checklist_id
  LEFT JOIN projects p ON p.id = c.project_id
  LEFT JOIN agg ON agg.application_id = a.id
),
vw_frente_medicoes AS (
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
  WHERE tag_set <> '(sem tag)'
),
vw_frente_evolucao AS (
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
  LEFT JOIN a ON a.tag_set_key = b.tag_set_key
)
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
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_application_tags AS (
  SELECT a.id      AS application_id,
         a.org_id,
         tid       AS tag_id,
         COALESCE(t.label, '(tag removida)') AS tag
  FROM applications a
  CROSS JOIN LATERAL unnest(a.tags_ids) AS tid
  LEFT JOIN tags t ON t.id = tid
),
vw_application_items AS (
  SELECT
    ai.id                       AS item_id,
    ai.application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title                     AS checklist,
    a.status                    AS status_aplicacao,
    a.date                      AS data_aplicacao,
    ai.position,
    ai.title                    AS item_titulo,
    NULLIF(split_part(ai.title, ': ', 1), ai.title) AS grupo,
    ai.answer                   AS resposta,
    os.semantic,
    ai.answer <> ''                              AS respondido,
    COALESCE(os.semantic = 'positivo', FALSE)    AS concluido,
    COALESCE(os.semantic = 'negativo', FALSE)    AS nao_conforme,
    COALESCE(os.semantic = 'neutro',   FALSE)    AS parcial,
    ai.workflow_status,
    ai.answered_at,
    ai.note,
    ai.note <> ''               AS tem_nota,
    ai.quantity                 AS quantidade,
    ai.suggested,
    ai.suggestion_source,
    ai.tags_ids                 AS item_tags_ids,
    ai.created_at,
    ai.updated_at,
    (SELECT count(*) FROM attachments att WHERE att.application_item_id = ai.id) AS fotos
  FROM application_items ai
  JOIN applications a ON a.id = ai.application_id
  JOIN checklists   c ON c.id = a.checklist_id
  LEFT JOIN vw_checklist_option_semantics os
         ON os.checklist_id = a.checklist_id
        AND os.label        = ai.answer
),
vw_applications AS (
  WITH agg AS (
    SELECT application_id,
           count(*)                                          AS total_itens,
           count(*) FILTER (WHERE respondido)                AS itens_respondidos,
           count(*) FILTER (WHERE concluido)                 AS itens_concluidos,
           count(*) FILTER (WHERE nao_conforme)              AS itens_nao_conformes,
           count(*) FILTER (WHERE parcial)                   AS itens_parciais,
           count(*) FILTER (WHERE NOT respondido)            AS itens_pendentes,
           count(*) FILTER (WHERE workflow_status IS NOT NULL
                              AND NOT respondido)            AS itens_em_workflow,
           count(*) FILTER (WHERE tem_nota)                  AS itens_com_nota,
           COALESCE(sum(fotos), 0)                           AS fotos,
           min(answered_at)                                  AS primeira_resposta,
           max(answered_at)                                  AS ultima_resposta
    FROM vw_application_items
    GROUP BY 1
  )
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    p.name              AS projeto,
    a.checklist_id,
    c.title             AS checklist,
    a.status,
    a.date              AS data,
    a.created_at,
    a.updated_at,
    COALESCE(a.completed_at,
             CASE WHEN a.status = 'completed' THEN a.updated_at END) AS concluida_em,
    a.transcript IS NOT NULL                    AS usou_voz,
    a.gallery_source_application_id IS NOT NULL AS repetida_de_outra,
    a.tags_ids,
    -- chave estável do conjunto de tags: é isto que agrupa "a mesma coisa"
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE(
      (SELECT string_agg(vt.tag, ' · ' ORDER BY vt.tag)
       FROM vw_application_tags vt WHERE vt.application_id = a.id),
      '(sem tag)')                              AS tag_set,
    COALESCE(agg.total_itens, 0)        AS total_itens,
    COALESCE(agg.itens_respondidos, 0)  AS itens_respondidos,
    COALESCE(agg.itens_concluidos, 0)   AS itens_concluidos,
    COALESCE(agg.itens_nao_conformes,0) AS itens_nao_conformes,
    COALESCE(agg.itens_parciais, 0)     AS itens_parciais,
    COALESCE(agg.itens_pendentes, 0)    AS itens_pendentes,
    COALESCE(agg.itens_em_workflow, 0)  AS itens_em_workflow,
    COALESCE(agg.itens_com_nota, 0)     AS itens_com_nota,
    COALESCE(agg.fotos, 0)              AS fotos,
    agg.primeira_resposta,
    agg.ultima_resposta,
    ROUND(100.0 * COALESCE(agg.itens_concluidos,0)
          / NULLIF(agg.total_itens, 0), 1)      AS pct_concluido,
    ROUND(100.0 * COALESCE(agg.itens_respondidos,0)
          / NULLIF(agg.total_itens, 0), 1)      AS pct_respondido,
    ROUND(EXTRACT(EPOCH FROM (agg.ultima_resposta - agg.primeira_resposta))/60.0, 1)
                                                AS minutos_em_campo
  FROM applications a
  JOIN checklists c  ON c.id = a.checklist_id
  LEFT JOIN projects p ON p.id = c.project_id
  LEFT JOIN agg ON agg.application_id = a.id
),
vw_frente_medicoes AS (
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
  WHERE tag_set <> '(sem tag)'
),
vw_frente_evolucao AS (
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
  LEFT JOIN a ON a.tag_set_key = b.tag_set_key
)
SELECT date_trunc('month', data)::date AS mes,
       frente,
       MAX(pct_concluido)              AS pct_concluido
FROM vw_frente_medicoes
GROUP BY 1, 2
ORDER BY 1;

-- @card 6.5 — Tabela de apoio da barra (conferir os números do 6.1)
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_application_tags AS (
  SELECT a.id      AS application_id,
         a.org_id,
         tid       AS tag_id,
         COALESCE(t.label, '(tag removida)') AS tag
  FROM applications a
  CROSS JOIN LATERAL unnest(a.tags_ids) AS tid
  LEFT JOIN tags t ON t.id = tid
),
vw_application_items AS (
  SELECT
    ai.id                       AS item_id,
    ai.application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title                     AS checklist,
    a.status                    AS status_aplicacao,
    a.date                      AS data_aplicacao,
    ai.position,
    ai.title                    AS item_titulo,
    NULLIF(split_part(ai.title, ': ', 1), ai.title) AS grupo,
    ai.answer                   AS resposta,
    os.semantic,
    ai.answer <> ''                              AS respondido,
    COALESCE(os.semantic = 'positivo', FALSE)    AS concluido,
    COALESCE(os.semantic = 'negativo', FALSE)    AS nao_conforme,
    COALESCE(os.semantic = 'neutro',   FALSE)    AS parcial,
    ai.workflow_status,
    ai.answered_at,
    ai.note,
    ai.note <> ''               AS tem_nota,
    ai.quantity                 AS quantidade,
    ai.suggested,
    ai.suggestion_source,
    ai.tags_ids                 AS item_tags_ids,
    ai.created_at,
    ai.updated_at,
    (SELECT count(*) FROM attachments att WHERE att.application_item_id = ai.id) AS fotos
  FROM application_items ai
  JOIN applications a ON a.id = ai.application_id
  JOIN checklists   c ON c.id = a.checklist_id
  LEFT JOIN vw_checklist_option_semantics os
         ON os.checklist_id = a.checklist_id
        AND os.label        = ai.answer
),
vw_applications AS (
  WITH agg AS (
    SELECT application_id,
           count(*)                                          AS total_itens,
           count(*) FILTER (WHERE respondido)                AS itens_respondidos,
           count(*) FILTER (WHERE concluido)                 AS itens_concluidos,
           count(*) FILTER (WHERE nao_conforme)              AS itens_nao_conformes,
           count(*) FILTER (WHERE parcial)                   AS itens_parciais,
           count(*) FILTER (WHERE NOT respondido)            AS itens_pendentes,
           count(*) FILTER (WHERE workflow_status IS NOT NULL
                              AND NOT respondido)            AS itens_em_workflow,
           count(*) FILTER (WHERE tem_nota)                  AS itens_com_nota,
           COALESCE(sum(fotos), 0)                           AS fotos,
           min(answered_at)                                  AS primeira_resposta,
           max(answered_at)                                  AS ultima_resposta
    FROM vw_application_items
    GROUP BY 1
  )
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    p.name              AS projeto,
    a.checklist_id,
    c.title             AS checklist,
    a.status,
    a.date              AS data,
    a.created_at,
    a.updated_at,
    COALESCE(a.completed_at,
             CASE WHEN a.status = 'completed' THEN a.updated_at END) AS concluida_em,
    a.transcript IS NOT NULL                    AS usou_voz,
    a.gallery_source_application_id IS NOT NULL AS repetida_de_outra,
    a.tags_ids,
    -- chave estável do conjunto de tags: é isto que agrupa "a mesma coisa"
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE(
      (SELECT string_agg(vt.tag, ' · ' ORDER BY vt.tag)
       FROM vw_application_tags vt WHERE vt.application_id = a.id),
      '(sem tag)')                              AS tag_set,
    COALESCE(agg.total_itens, 0)        AS total_itens,
    COALESCE(agg.itens_respondidos, 0)  AS itens_respondidos,
    COALESCE(agg.itens_concluidos, 0)   AS itens_concluidos,
    COALESCE(agg.itens_nao_conformes,0) AS itens_nao_conformes,
    COALESCE(agg.itens_parciais, 0)     AS itens_parciais,
    COALESCE(agg.itens_pendentes, 0)    AS itens_pendentes,
    COALESCE(agg.itens_em_workflow, 0)  AS itens_em_workflow,
    COALESCE(agg.itens_com_nota, 0)     AS itens_com_nota,
    COALESCE(agg.fotos, 0)              AS fotos,
    agg.primeira_resposta,
    agg.ultima_resposta,
    ROUND(100.0 * COALESCE(agg.itens_concluidos,0)
          / NULLIF(agg.total_itens, 0), 1)      AS pct_concluido,
    ROUND(100.0 * COALESCE(agg.itens_respondidos,0)
          / NULLIF(agg.total_itens, 0), 1)      AS pct_respondido,
    ROUND(EXTRACT(EPOCH FROM (agg.ultima_resposta - agg.primeira_resposta))/60.0, 1)
                                                AS minutos_em_campo
  FROM applications a
  JOIN checklists c  ON c.id = a.checklist_id
  LEFT JOIN projects p ON p.id = c.project_id
  LEFT JOIN agg ON agg.application_id = a.id
),
vw_frente_medicoes AS (
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
  WHERE tag_set <> '(sem tag)'
),
vw_frente_evolucao AS (
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
  LEFT JOIN a ON a.tag_set_key = b.tag_set_key
)
SELECT frente,
       data_anterior, pct_anterior,
       data_atual,    pct_atual,
       ROUND(pct_atual - pct_anterior, 1) AS delta_pp,
       itens_anterior || ' → ' || itens_atual || ' de ' || total_itens AS itens
FROM vw_frente_evolucao
ORDER BY delta_pp DESC NULLS LAST;
