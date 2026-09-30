-- ---------------------------------------------------------------------
-- DASHBOARD 5 — SAÚDE DO CATÁLOGO   (o checklist está bem desenhado?)
-- VERSÃO STANDALONE — cole um card inteiro no editor nativo do Metabase.
-- Não precisa criar view nenhuma: o bloco WITH no topo de cada card é a
-- própria definição das views, embutida. Cada card é UM SELECT só, que é
-- o único formato que o editor nativo aceita.
-- ---------------------------------------------------------------------


-- =====================================================================
-- DASHBOARD 5 — SAÚDE DO CATÁLOGO   (o checklist está bem desenhado?)
-- O denominador dos outros dashboards é o checklist. Se ele estiver ruim,
-- todo indicador de produção está errado. Este dashboard audita isso.
-- Público: quem mantém os checklists.
-- =====================================================================

-- @card 5.1 — Uso por checklist (tabela)
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
)
SELECT c.title                                          AS checklist,
       jsonb_array_length(c.items)                      AS itens_no_modelo,
       count(a.application_id)                          AS aplicacoes,
       count(a.application_id) FILTER (WHERE a.status='completed') AS concluidas,
       ROUND(avg(a.pct_concluido), 1)                   AS pct_medio,
       ROUND(avg(a.minutos_em_campo), 1)                AS minutos_medios,
       max(a.data)::date                                AS ultimo_uso
FROM checklists c
LEFT JOIN vw_applications a ON a.checklist_id = c.id
GROUP BY 1, 2
ORDER BY aplicacoes DESC;

-- @card 5.2 — Checklists nunca usados / abandonados
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
)
SELECT c.title AS checklist,
       jsonb_array_length(c.items) AS itens,
       c.created_at::date          AS criado_em,
       max(a.data)::date           AS ultimo_uso,
       COALESCE(EXTRACT(DAY FROM now() - max(a.data))::int, NULL) AS dias_sem_uso
FROM checklists c
LEFT JOIN vw_applications a ON a.checklist_id = c.id
GROUP BY 1, 2, 3
HAVING count(a.application_id) = 0 OR max(a.data) < now() - interval '60 days'
ORDER BY dias_sem_uso DESC NULLS FIRST;

-- @card 5.3 — Itens que ninguém nunca responde (candidatos a remoção)
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
)
SELECT checklist,
       item_titulo AS item,
       count(*)                            AS vezes_apresentado,
       count(*) FILTER (WHERE respondido)  AS vezes_respondido,
       ROUND(100.0 * count(*) FILTER (WHERE respondido) / count(*), 1) AS pct_resposta
FROM vw_application_items
GROUP BY 1, 2
HAVING count(*) >= 3
   AND count(*) FILTER (WHERE respondido) = 0
ORDER BY vezes_apresentado DESC
LIMIT 50;

-- @card 5.4 — Itens ad-hoc: criados em campo, fora do modelo
--   Muitos itens sem checklist_item_id = o checklist não reflete a realidade.
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
)
SELECT a.checklist,
       count(*) FILTER (WHERE ai.checklist_item_id IS NULL) AS itens_adhoc,
       count(*)                                             AS itens_totais,
       ROUND(100.0 * count(*) FILTER (WHERE ai.checklist_item_id IS NULL) / count(*), 1) AS pct_adhoc
FROM application_items ai
JOIN vw_applications a ON a.application_id = ai.application_id
GROUP BY 1
HAVING count(*) >= 5
ORDER BY pct_adhoc DESC;

-- @card 5.5 — Tags mais usadas (e quais nunca são usadas)
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
)
SELECT t.label AS tag,
       count(vt.application_id) AS aplicacoes,
       max(a.data)::date        AS ultimo_uso
FROM tags t
LEFT JOIN vw_application_tags vt ON vt.tag_id = t.id
LEFT JOIN vw_applications a      ON a.application_id = vt.application_id
GROUP BY 1
ORDER BY aplicacoes DESC, tag;

-- @card 5.6 — Como a informação entra no app (voz x manual x repetição)
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
)
SELECT date_trunc('month', data)::date AS mes,
       count(*)                                        AS aplicacoes,
       count(*) FILTER (WHERE usou_voz)                AS com_transcricao,
       count(*) FILTER (WHERE repetida_de_outra)       AS repetidas_da_galeria,
       sum(fotos)                                      AS fotos
FROM vw_applications
GROUP BY 1
ORDER BY 1;

-- @card 5.7 — Sugestão automática: aceita ou ignorada?
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
)
SELECT COALESCE(suggestion_source, '(preenchimento manual)') AS origem,
       count(*)                           AS itens,
       count(*) FILTER (WHERE respondido) AS respondidos,
       ROUND(100.0 * count(*) FILTER (WHERE respondido) / count(*), 1) AS pct_aproveitado
FROM vw_application_items
GROUP BY 1
ORDER BY itens DESC;

-- @card 5.8 — Tamanho do checklist x taxa de conclusão (checklist grande demais?)
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
)
SELECT CASE WHEN total_itens <= 5  THEN 'até 5 itens'
            WHEN total_itens <= 15 THEN '6-15 itens'
            WHEN total_itens <= 30 THEN '16-30 itens'
            ELSE '30+ itens' END AS tamanho,
       count(*)                  AS aplicacoes,
       ROUND(avg(pct_concluido), 1)   AS pct_medio_concluido,
       ROUND(avg(minutos_em_campo), 1) AS minutos_medios
FROM vw_applications
WHERE total_itens > 0
GROUP BY 1
ORDER BY min(total_itens);
