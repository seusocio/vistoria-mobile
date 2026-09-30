-- ---------------------------------------------------------------------
-- ANDAMENTO DE OBRA — modelo cumulativo
-- VERSÃO STANDALONE — GERADA POR gen.py, NÃO EDITE.
-- Cole um card inteiro no editor nativo do Metabase: o bloco WITH no topo
-- é a definição das views embutida, então não é preciso criar view nenhuma.
-- ---------------------------------------------------------------------


-- =====================================================================
-- ANDAMENTO DE OBRA — modelo cumulativo
--
-- Correção do modelo anterior. O que muda:
--
--  1. FRENTE = checklist + conjunto de tags, não só a tag. A tag APT-11
--     tem duas frentes diferentes ("Áreas comuns" e "Vistoria de
--     apartamentos"); tratá-las como uma só misturava denominadores.
--
--  2. O progresso é CUMULATIVO. Um item concluído numa vistoria continua
--     concluído nas seguintes — é assim que o app copia. Então o que
--     interessa por item é a PRIMEIRA vistoria em que ele apareceu
--     concluído (`concluido_em`), não o estado de cada aplicação isolada.
--
--  3. A data de um item é a data da VISTORIA (applications.date), nunca
--     `answered_at`. No banco, `answered_at` guarda a hora em que a linha
--     foi gravada: os itens da vistoria de 16/09 estão com answered_at de
--     28/09. Usar answered_at joga todo o histórico para o dia da carga.
--
-- Exemplo real conferido (Áreas comuns · APT-11, 6 itens):
--     16/09 → 1 concluído   (1/6)
--     23/09 → +2            (3/6)
--     28/09 → +3            (6/6)
-- =====================================================================

-- DROP VIEW IF EXISTS vw_frente_andamento CASCADE;
-- DROP VIEW IF EXISTS vw_frente_item CASCADE;
-- DROP VIEW IF EXISTS vw_frente_aplicacao CASCADE;

-- Cada aplicação, já com a identidade da frente resolvida.
-- CREATE VIEW vw_frente_aplicacao AS
-- SELECT
--   a.id                AS application_id,
--   a.org_id,
--   c.project_id,
--   a.checklist_id,
--   c.title             AS checklist,
--   a.date              AS data,
--   a.date::date        AS dia,
--   a.status,
--   array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
--   COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
--             FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
--            '(sem tag)')                                            AS tags,
--   c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
--             FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
--            '(sem tag)')                                            AS frente
-- FROM applications a
-- JOIN checklists c ON c.id = a.checklist_id;

-- Um item por frente (não por aplicação), com a data em que ficou pronto.
-- concluido_em NULL = nunca foi concluído até hoje.
-- CREATE VIEW vw_frente_item AS
-- WITH itens AS (
--   SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
--          fa.org_id, fa.project_id, fa.data,
--          COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
--          i.title AS item,
--          COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
--          COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
--   FROM vw_frente_aplicacao fa
--   JOIN application_items i ON i.application_id = fa.application_id
--   LEFT JOIN vw_checklist_option_semantics os
--          ON os.checklist_id = fa.checklist_id AND os.label = i.answer
-- )
-- SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
--        item_key,
--        MIN(item)                                   AS item,
       -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
       -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
--        btrim(split_part(MIN(item), ':', 1))        AS servico,
--        NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
--        MIN(data) FILTER (WHERE concluido)          AS concluido_em,
--        BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
--        MIN(data)                                   AS visto_desde
-- FROM itens
-- GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key;

-- Uma linha por frente: escopo, quanto está pronto, desde quando.
-- CREATE VIEW vw_frente_andamento AS
-- SELECT frente, checklist, tags, checklist_id, tag_set_key, org_id, project_id,
--        count(*)                                         AS itens_total,
--        count(*) FILTER (WHERE concluido_em IS NOT NULL) AS itens_concluidos,
--        count(*) FILTER (WHERE concluido_em IS NULL)     AS itens_pendentes,
--        ROUND(100.0 * count(*) FILTER (WHERE concluido_em IS NOT NULL) / count(*), 1) AS pct_concluido,
--        MIN(visto_desde)::date                           AS primeira_vistoria,
--        MAX(concluido_em)::date                          AS ultimo_avanco
-- FROM vw_frente_item
-- GROUP BY frente, checklist, tags, checklist_id, tag_set_key, org_id, project_id;

-- ---------------------------------------------------------------------
-- CARDS
--
-- Duas pizzas, mesma leitura em escopos diferentes:
--   10.1  escopo CHECKLIST  — "como está a Vistoria de apartamentos inteira"
--   10.2  escopo FRENTE     — "como está o APT-11 dentro dela"
--
-- Em ambas: azul = já estava pronto antes do período, verde = ficou pronto
-- durante, cinza = falta. A pizza inteira é o escopo (100%).
-- ---------------------------------------------------------------------

-- @card 10.1 — Pizza por checklist (escopo maior)
--   Visualization → Pie. Filtros: checklist, data_a, data_b.
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
),
base AS (
  SELECT * FROM vw_frente_item WHERE 1 = 1 [[AND checklist = {{checklist}}]]
)
SELECT '1 · Feito antes'      AS faixa, count(*) AS itens FROM base
  WHERE concluido_em::date < {{data_a}}
UNION ALL
SELECT '2 · Feito no período', count(*) FROM base
  WHERE concluido_em::date >= {{data_a}} AND concluido_em::date <= {{data_b}}
UNION ALL
SELECT '3 · Falta', count(*) FROM base
  WHERE concluido_em IS NULL OR concluido_em::date > {{data_b}};

-- @card 10.2 — Pizza por frente (escopo menor: checklist + conjunto de tags)
--   Mesma pizza, recortada em uma frente só. Filtros: frente, data_a, data_b.
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
),
base AS (
  SELECT * FROM vw_frente_item WHERE 1 = 1 [[AND frente = {{frente}}]]
)
SELECT '1 · Feito antes'      AS faixa, count(*) AS itens FROM base
  WHERE concluido_em::date < {{data_a}}
UNION ALL
SELECT '2 · Feito no período', count(*) FROM base
  WHERE concluido_em::date >= {{data_a}} AND concluido_em::date <= {{data_b}}
UNION ALL
SELECT '3 · Falta', count(*) FROM base
  WHERE concluido_em IS NULL OR concluido_em::date > {{data_b}};

-- @card 10.3 — A mesma decomposição, frente a frente (barra empilhada)
--   Visualization → Row, Stack ligado. Mesmas três cores.
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
)
SELECT frente,
       count(*) FILTER (WHERE concluido_em::date < {{data_a}})                AS "1 · feito antes",
       count(*) FILTER (WHERE concluido_em::date >= {{data_a}}
                          AND concluido_em::date <= {{data_b}})               AS "2 · feito no período",
       count(*) FILTER (WHERE concluido_em IS NULL
                          OR concluido_em::date > {{data_b}})                 AS "3 · falta"
FROM vw_frente_item
WHERE 1 = 1 [[AND checklist = {{checklist}}]]
GROUP BY frente
ORDER BY 3 DESC, 2 DESC;

-- @card 10.4 — Linha do tempo cumulativa
--   Quantos itens estavam prontos em cada data de vistoria. Sobe e nunca desce.
WITH vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
),
marcos AS (
  SELECT DISTINCT fa.frente, fa.dia
  FROM vw_frente_aplicacao fa
  WHERE 1 = 1 [[AND fa.frente = {{frente}}]]
)
SELECT m.frente, m.dia,
       count(i.item_key) FILTER (WHERE i.concluido_em::date <= m.dia) AS concluidos_ate_a_data,
       count(i.item_key)                                              AS escopo
FROM marcos m
JOIN vw_frente_item i ON i.frente = m.frente
GROUP BY m.frente, m.dia
ORDER BY m.frente, m.dia;

-- @card 10.5 — Item a item: quando cada um ficou pronto
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
)
SELECT frente, item,
       COALESCE(concluido_em::date::text, '— pendente —') AS concluido_em,
       CASE
         WHEN concluido_em IS NULL             THEN 'pendente'
         WHEN concluido_em::date < {{data_a}}  THEN 'já estava pronto'
         WHEN concluido_em::date <= {{data_b}} THEN 'feito no período'
         ELSE 'feito depois do período'
       END AS situacao,
       teve_nao_conformidade
FROM vw_frente_item
WHERE 1 = 1 [[AND frente = {{frente}}]]
ORDER BY frente, concluido_em NULLS LAST, item;

-- @card 10.6 — Placar das frentes (quanto andou no período)
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
),
vw_frente_andamento AS (
  SELECT frente, checklist, tags, checklist_id, tag_set_key, org_id, project_id,
         count(*)                                         AS itens_total,
         count(*) FILTER (WHERE concluido_em IS NOT NULL) AS itens_concluidos,
         count(*) FILTER (WHERE concluido_em IS NULL)     AS itens_pendentes,
         ROUND(100.0 * count(*) FILTER (WHERE concluido_em IS NOT NULL) / count(*), 1) AS pct_concluido,
         MIN(visto_desde)::date                           AS primeira_vistoria,
         MAX(concluido_em)::date                          AS ultimo_avanco
  FROM vw_frente_item
  GROUP BY frente, checklist, tags, checklist_id, tag_set_key, org_id, project_id
)
SELECT a.frente, a.itens_total AS escopo, a.itens_concluidos, a.pct_concluido,
       count(i.item_key) FILTER (WHERE i.concluido_em::date >= {{data_a}}
                                   AND i.concluido_em::date <= {{data_b}}) AS avanco_no_periodo,
       a.primeira_vistoria, a.ultimo_avanco
FROM vw_frente_andamento a
JOIN vw_frente_item i ON i.frente = a.frente
WHERE 1 = 1 [[AND a.checklist = {{checklist}}]]
GROUP BY a.frente, a.itens_total, a.itens_concluidos, a.pct_concluido,
         a.primeira_vistoria, a.ultimo_avanco
ORDER BY avanco_no_periodo DESC, a.pct_concluido DESC;

-- @card 10.7 — Visão geral (sem período)
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
),
vw_frente_andamento AS (
  SELECT frente, checklist, tags, checklist_id, tag_set_key, org_id, project_id,
         count(*)                                         AS itens_total,
         count(*) FILTER (WHERE concluido_em IS NOT NULL) AS itens_concluidos,
         count(*) FILTER (WHERE concluido_em IS NULL)     AS itens_pendentes,
         ROUND(100.0 * count(*) FILTER (WHERE concluido_em IS NOT NULL) / count(*), 1) AS pct_concluido,
         MIN(visto_desde)::date                           AS primeira_vistoria,
         MAX(concluido_em)::date                          AS ultimo_avanco
  FROM vw_frente_item
  GROUP BY frente, checklist, tags, checklist_id, tag_set_key, org_id, project_id
)
SELECT frente, checklist, tags, itens_total, itens_concluidos, itens_pendentes,
       pct_concluido, primeira_vistoria, ultimo_avanco
FROM vw_frente_andamento
WHERE 1 = 1 [[AND checklist = {{checklist}}]]
ORDER BY pct_concluido DESC, frente;

-- @card 10.8 — Serviços: feito no período × falta  ★ o "15 bases de shaft"
--   Dimensão = serviço, então o hover do Metabase já mostra
--   "Base shaft · feito no período 15 · falta 3".
--   Visualization → Row, Stack ligado. Verde #1BAF7A e cinza #D7DAE0.
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
)
SELECT servico,
       count(*) FILTER (WHERE concluido_em::date >= {{data_a}}
                          AND concluido_em::date <= {{data_b}})  AS "feito no período",
       count(*) FILTER (WHERE concluido_em IS NULL)              AS "falta",
       count(*) FILTER (WHERE concluido_em::date < {{data_a}})   AS "já estava pronto"
FROM vw_frente_item
WHERE 1 = 1 [[AND checklist = {{checklist}}]]
GROUP BY servico
ORDER BY 2 DESC, 3 DESC;

-- @card 10.9 — Serviço × local, o detalhe por trás da barra
--   "Base shaft: quais locais foram feitos, quais faltam."
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
)
SELECT servico,
       COALESCE(local, '—')                                      AS local,
       count(*)                                                  AS previsto,
       count(*) FILTER (WHERE concluido_em::date >= {{data_a}}
                          AND concluido_em::date <= {{data_b}})  AS feito_no_periodo,
       count(*) FILTER (WHERE concluido_em IS NOT NULL)          AS feito_total,
       count(*) FILTER (WHERE concluido_em IS NULL)              AS falta
FROM vw_frente_item
WHERE 1 = 1 [[AND checklist = {{checklist}}]]
GROUP BY servico, local
ORDER BY falta DESC, servico, local;

-- @card 10.10 — O que falta nesta frente (lista de pendências)
--   Filtra só por frente: a frente já carrega o checklist no nome, e usar os
--   dois filtros juntos os torna contraditórios (frente de um checklist +
--   checklist de outro = zero linhas).
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
)
SELECT frente, servico, COALESCE(local, '—') AS local, item
FROM vw_frente_item
WHERE concluido_em IS NULL
  [[AND frente = {{frente}}]]
  [[AND servico = {{servico}}]]
ORDER BY frente, servico, local;

-- @card 10.11 — Quanto falta, por serviço  ★ leitura direta
--   Uma série só, ordenada. Visualization → Row, cor âmbar #EB6834,
--   e ligue "Show values on data points" para o número aparecer na barra.
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
)
SELECT servico,
       count(*) FILTER (WHERE concluido_em IS NULL) AS "falta"
FROM vw_frente_item
WHERE 1 = 1 [[AND checklist = {{checklist}}]]
GROUP BY servico
HAVING count(*) FILTER (WHERE concluido_em IS NULL) > 0
ORDER BY 2 DESC;

-- ---------------------------------------------------------------------
-- GANTT
--
-- O Metabase não tem gráfico de Gantt. A forma nativa de fazer é uma barra
-- empilhada com duas séries: a primeira é o deslocamento até o início
-- (pintada da cor do fundo, some) e a segunda é a duração (colorida).
--
-- Visualization → Row · Display → Stack · Settings → cores:
--    "espera"  → branco #FFFFFF   (ou a cor de fundo do seu tema)
--    "duração" → azul   #2A78D6
--
-- Nada aqui é fixo: um checklist novo vira uma linha sozinho.
-- ---------------------------------------------------------------------;

-- @card 10.12 — Gantt por checklist
WITH vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
)
SELECT s.checklist,
       (s.inicio - b.t0)::int                      AS "espera",
       GREATEST((s.fim - s.inicio)::int, 1)        AS "duração"
FROM (
  SELECT checklist, MIN(dia) AS inicio, MAX(dia) AS fim
  FROM vw_frente_aplicacao GROUP BY checklist
) s
CROSS JOIN (SELECT MIN(dia) AS t0 FROM vw_frente_aplicacao) b
ORDER BY s.inicio, s.checklist;

-- @card 10.13 — Gantt por frente (dentro de um checklist)
WITH vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
)
SELECT s.frente,
       (s.inicio - b.t0)::int               AS "espera",
       GREATEST((s.fim - s.inicio)::int, 1) AS "duração"
FROM (
  SELECT frente, MIN(dia) AS inicio, MAX(dia) AS fim
  FROM vw_frente_aplicacao
  WHERE 1 = 1 [[AND checklist = {{checklist}}]]
  GROUP BY frente
) s
CROSS JOIN (SELECT MIN(dia) AS t0 FROM vw_frente_aplicacao) b
ORDER BY s.inicio, s.frente;

-- @card 10.14 — A tabela que acompanha o Gantt
--   Porte e ritmo de cada checklist. É o que separa um checklist de teste
--   (poucas frentes, poucos itens) de um de produção — sem precisar
--   marcar nada na mão: o número entrega.
WITH vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
)
SELECT fa.checklist,
       count(DISTINCT fa.frente)                    AS frentes,
       count(DISTINCT fa.application_id)            AS vistorias,
       count(DISTINCT fa.dia)                       AS dias_com_vistoria,
       MIN(fa.dia)                                  AS inicio,
       MAX(fa.dia)                                  AS fim,
       (MAX(fa.dia) - MIN(fa.dia))::int             AS duracao_dias,
       (SELECT count(*) FROM vw_frente_item i WHERE i.checklist = fa.checklist)            AS itens_escopo,
       (SELECT count(*) FROM vw_frente_item i WHERE i.checklist = fa.checklist
          AND i.concluido_em IS NOT NULL)                                                  AS itens_concluidos,
       (SELECT ROUND(100.0 * count(*) FILTER (WHERE i.concluido_em IS NOT NULL) / NULLIF(count(*),0), 1)
          FROM vw_frente_item i WHERE i.checklist = fa.checklist)                          AS pct_concluido
FROM vw_frente_aplicacao fa
GROUP BY fa.checklist
ORDER BY itens_escopo DESC;

-- ---------------------------------------------------------------------
-- ONDE FALTA
--
-- Os cards acima dizem QUANTO falta. Estes dizem ONDE: em quais frentes
-- (apartamentos) e em quais locais dentro delas.
-- O filtro {{servico}} é o que amarra tudo — escolha "Soleira" e os três
-- cards abaixo respondem sobre Soleira.
-- ---------------------------------------------------------------------;

-- @card 10.15 — Onde falta este serviço (por frente)  ★ o "onde"
--   Visualization → Row, cor âmbar #EB6834, valores ligados.
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
)
SELECT frente,
       count(*) AS "falta"
FROM vw_frente_item
WHERE concluido_em IS NULL
  [[AND servico = {{servico}}]]
  [[AND checklist = {{checklist}}]]
GROUP BY frente
HAVING count(*) > 0
ORDER BY 2 DESC, frente;

-- @card 10.16 — Onde falta este serviço (por local)
--   "Soleira falta mais em qual cômodo?"
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
)
SELECT COALESCE(local, '—') AS local,
       count(*)             AS "falta",
       count(DISTINCT frente) AS frentes_afetadas
FROM vw_frente_item
WHERE concluido_em IS NULL
  [[AND servico = {{servico}}]]
  [[AND checklist = {{checklist}}]]
GROUP BY local
ORDER BY 2 DESC;

-- @card 10.17 — Mapa de pendências: serviço × local
--   Visualization → Pivot table (serviço nas linhas, local nas colunas).
--   A leitura de uma olhada: onde estão os buracos da obra.
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
)
SELECT servico,
       COALESCE(local, '—')   AS local,
       count(*)               AS falta,
       count(DISTINCT frente) AS frentes_afetadas
FROM vw_frente_item
WHERE concluido_em IS NULL
  [[AND checklist = {{checklist}}]]
GROUP BY servico, local
ORDER BY falta DESC;

-- @card 10.18 — A lista nominal: exatamente onde ir
--   Cada linha é um serviço pendente num lugar específico.
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
)
SELECT frente        AS onde,
       servico,
       COALESCE(local, '—') AS local,
       item          AS servico_completo
FROM vw_frente_item
--   Filtra só por serviço. Combinar com o filtro de frente faz o card abrir
--   vazio sempre que a frente escolhida não tiver aquele serviço pendente —
--   e a pergunta aqui é justamente "em QUAIS frentes falta".
WHERE concluido_em IS NULL
  [[AND servico = {{servico}}]]
ORDER BY frente, servico, local;

-- @card 10.19 — Falta X: em quais tags  ★ "falta 54 soleiras: APT-11, APT-33…"
--   Uma linha por serviço, com a lista das tags na própria célula.
--   Visualization → Table. A coluna "onde" é a que você lê.
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
),
pend AS (
  SELECT DISTINCT servico, tags,
         -- ordena APT-9 antes de APT-11 (ordem natural, não alfabética)
         NULLIF(regexp_replace(tags, '\D', '', 'g'), '')::bigint AS ord
  FROM vw_frente_item
  WHERE concluido_em IS NULL
    [[AND checklist = {{checklist}}]]
),
cnt AS (
  SELECT servico,
         count(*)               AS falta,
         count(DISTINCT tags)   AS tags_afetadas
  FROM vw_frente_item
  WHERE concluido_em IS NULL
    [[AND checklist = {{checklist}}]]
  GROUP BY servico
)
--   Duas contagens diferentes, não confunda:
--     qtd_tags        = em quantas tags falta  ("falta 54 soleiras")
--     itens_pendentes = quantos itens ao todo  (54 tags × 4 locais = 216)
SELECT c.servico,
       c.tags_afetadas AS qtd_tags,
       c.falta         AS itens_pendentes,
       string_agg(p.tags, ', ' ORDER BY p.ord NULLS LAST, p.tags) AS onde
FROM cnt c
JOIN pend p ON p.servico = c.servico
GROUP BY c.servico, c.falta, c.tags_afetadas
ORDER BY c.tags_afetadas DESC, c.falta DESC;

-- @card 10.20 — A mesma leitura, quebrada por local
--   "Soleira · WC: falta em 54 — APT-11, APT-12, …"
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
),
pend AS (
  SELECT DISTINCT servico, COALESCE(local, '—') AS local, tags,
         NULLIF(regexp_replace(tags, '\D', '', 'g'), '')::bigint AS ord
  FROM vw_frente_item
  WHERE concluido_em IS NULL
    [[AND servico = {{servico}}]]
    [[AND checklist = {{checklist}}]]
),
cnt AS (
  SELECT servico, COALESCE(local, '—') AS local, count(*) AS falta
  FROM vw_frente_item
  WHERE concluido_em IS NULL
    [[AND servico = {{servico}}]]
    [[AND checklist = {{checklist}}]]
  GROUP BY 1, 2
)
SELECT c.servico, c.local, c.falta,
       string_agg(p.tags, ', ' ORDER BY p.ord NULLS LAST, p.tags) AS onde
FROM cnt c
JOIN pend p ON p.servico = c.servico AND p.local = c.local
GROUP BY c.servico, c.local, c.falta
ORDER BY c.falta DESC, c.servico, c.local;

-- ---------------------------------------------------------------------
-- COMPANHEIROS "QUAIS TAGS"
--
-- Todo gráfico agregado deste dashboard tem um par que nomeia as tags.
-- Mapa de quem responde por quem:
--
--   pizzas 10.1 / 10.2 ......... 10.21 (por situação)
--   serviços 10.8 / 10.11 ...... 10.19 (por serviço) e 10.21
--   linha do tempo 10.4 ........ 10.22 (por data)
--   Gantt 10.12 / 10.13 ........ 10.23 (por checklist)
--   mapa 10.17 ................. 10.20 (por local)
--   barra por frente 10.3 ...... já traz a frente no eixo
--   onde falta 10.15 / 10.16 ... já trazem frente e local
-- ---------------------------------------------------------------------;

-- @card 10.21 — Quais tags, por situação  ★ o par das pizzas
--   Para cada serviço: quais tags já estavam prontas, quais avançaram no
--   período e quais seguem pendentes. É a pizza escrita por extenso.
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
),
base AS (
  SELECT servico, tags, concluido_em,
         CASE WHEN concluido_em IS NULL                 THEN '3 · falta'
              WHEN concluido_em::date < {{data_a}}      THEN '1 · já estava pronto'
              WHEN concluido_em::date <= {{data_b}}     THEN '2 · feito no período'
              ELSE '4 · depois do período' END          AS situacao
  FROM vw_frente_item
  WHERE 1 = 1
    [[AND checklist = {{checklist}}]]
    [[AND servico = {{servico}}]]
),
d AS (
  SELECT DISTINCT servico, situacao, tags,
         NULLIF(regexp_replace(tags, '\D', '', 'g'), '')::bigint AS ord
  FROM base
),
c AS (
  SELECT servico, situacao, count(DISTINCT tags) AS qtd_tags, count(*) AS itens
  FROM base GROUP BY 1, 2
)
SELECT c.servico, c.situacao, c.qtd_tags, c.itens,
       string_agg(d.tags, ', ' ORDER BY d.ord NULLS LAST, d.tags) AS onde
FROM c JOIN d ON d.servico = c.servico AND d.situacao = c.situacao
GROUP BY c.servico, c.situacao, c.qtd_tags, c.itens
ORDER BY c.servico, c.situacao;

-- @card 10.22 — Quais tags avançaram em cada data  ★ o par da linha do tempo
--   "Em 23/09 avançou Base shaft em APT-11, APT-12…"
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
),
base AS (
  SELECT concluido_em::date AS dia, servico, tags
  FROM vw_frente_item
  WHERE concluido_em IS NOT NULL
    [[AND checklist = {{checklist}}]]
    [[AND servico = {{servico}}]]
),
d AS (
  SELECT DISTINCT dia, servico, tags,
         NULLIF(regexp_replace(tags, '\D', '', 'g'), '')::bigint AS ord
  FROM base
),
c AS (
  SELECT dia, servico, count(DISTINCT tags) AS qtd_tags, count(*) AS itens
  FROM base GROUP BY 1, 2
)
SELECT c.dia, c.servico, c.qtd_tags, c.itens,
       string_agg(d.tags, ', ' ORDER BY d.ord NULLS LAST, d.tags) AS onde
FROM c JOIN d ON d.dia = c.dia AND d.servico = c.servico
GROUP BY c.dia, c.servico, c.qtd_tags, c.itens
ORDER BY c.dia DESC, c.itens DESC;

-- @card 10.23 — Quais tags por checklist  ★ o par do Gantt
--   Quantas tags o checklist cobre e quais ainda têm pendência.
WITH vw_checklist_option_semantics AS (
  SELECT c.id            AS checklist_id,
         opt->>'label'   AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_frente_aplicacao AS (
  SELECT
    a.id                AS application_id,
    a.org_id,
    c.project_id,
    a.checklist_id,
    c.title             AS checklist,
    a.date              AS data,
    a.date::date        AS dia,
    a.status,
    array_to_string(ARRAY(SELECT unnest(a.tags_ids) ORDER BY 1), '|') AS tag_set_key,
    COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS tags,
    c.title || ' · ' || COALESCE((SELECT string_agg(COALESCE(t.label,'?'), ' · ' ORDER BY t.label)
              FROM unnest(a.tags_ids) AS tid LEFT JOIN tags t ON t.id = tid),
             '(sem tag)')                                            AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_frente_item AS (
  WITH itens AS (
    SELECT fa.frente, fa.checklist_id, fa.checklist, fa.tag_set_key, fa.tags,
           fa.org_id, fa.project_id, fa.data,
           COALESCE(i.checklist_item_id, 'adhoc:' || i.title) AS item_key,
           i.title AS item,
           COALESCE(os.semantic = 'positivo', FALSE) AS concluido,
           COALESCE(os.semantic = 'negativo', FALSE) AS nao_conforme
    FROM vw_frente_aplicacao fa
    JOIN application_items i ON i.application_id = fa.application_id
    LEFT JOIN vw_checklist_option_semantics os
           ON os.checklist_id = fa.checklist_id AND os.label = i.answer
  )
  SELECT frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id,
         item_key,
         MIN(item)                                   AS item,
         -- "Base shaft: Churrasqueira" → serviço "Base shaft", local "Churrasqueira".
         -- btrim porque há títulos gravados com espaço duplo ("Forro gesso:  WC").
         btrim(split_part(MIN(item), ':', 1))        AS servico,
         NULLIF(btrim(substring(MIN(item) FROM position(':' IN MIN(item)) + 1)), '') AS local,
         MIN(data) FILTER (WHERE concluido)          AS concluido_em,
         BOOL_OR(nao_conforme)                       AS teve_nao_conformidade,
         MIN(data)                                   AS visto_desde
  FROM itens
  GROUP BY frente, checklist_id, checklist, tag_set_key, tags, org_id, project_id, item_key
),
d AS (
  SELECT DISTINCT checklist, tags,
         (SELECT count(*) FROM vw_frente_item x
           WHERE x.checklist = i.checklist AND x.tags = i.tags
             AND x.concluido_em IS NULL) > 0 AS tem_pendencia,
         NULLIF(regexp_replace(tags, '\D', '', 'g'), '')::bigint AS ord
  FROM vw_frente_item i
)
SELECT checklist,
       count(*)                                        AS tags_no_checklist,
       count(*) FILTER (WHERE tem_pendencia)            AS tags_com_pendencia,
       string_agg(tags, ', ' ORDER BY ord NULLS LAST, tags)
         FILTER (WHERE tem_pendencia)                   AS onde_falta,
       string_agg(tags, ', ' ORDER BY ord NULLS LAST, tags)
         FILTER (WHERE NOT tem_pendencia)               AS ja_completas
FROM d
GROUP BY checklist
ORDER BY tags_com_pendencia DESC;
