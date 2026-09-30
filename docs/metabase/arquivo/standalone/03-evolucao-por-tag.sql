-- ---------------------------------------------------------------------
-- DASHBOARD 3 — EVOLUÇÃO POR TAG   (a sua ideia central)
-- VERSÃO STANDALONE — cole um card inteiro no editor nativo do Metabase.
-- Não precisa criar view nenhuma: o bloco WITH no topo de cada card é a
-- própria definição das views, embutida. Cada card é UM SELECT só, que é
-- o único formato que o editor nativo aceita.
-- ---------------------------------------------------------------------


-- =====================================================================
-- DASHBOARD 3 — EVOLUÇÃO POR TAG   (a sua ideia central)
-- Duas aplicações com o MESMO conjunto de tags = a mesma frente medida
-- duas vezes. A diferença entre elas é a evolução da obra/serviço.
-- Público: acompanhamento semanal de avanço físico.
-- =====================================================================

-- @card 3.1 — Frentes acompanhadas (tag sets com 2+ medições)
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
SELECT tag_set,
       count(*)                                AS medicoes,
       min(data)::date                         AS primeira,
       max(data)::date                         AS ultima,
       max(pct_concluido) FILTER (WHERE TRUE)  AS melhor_pct,
       (array_agg(pct_concluido ORDER BY data DESC, created_at DESC))[1] AS pct_atual
FROM vw_applications
WHERE tag_set <> '(sem tag)'
GROUP BY tag_set
HAVING count(*) >= 2
ORDER BY ultima DESC;

-- @card 3.2 — Curva de avanço por frente (linha; série = tag_set)
--   Este é o gráfico-assinatura do dashboard.
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
SELECT tag_set,
       data::date     AS data,
       pct_concluido,
       itens_concluidos,
       total_itens
FROM vw_applications
WHERE tag_set <> '(sem tag)'
  AND tag_set IN (SELECT tag_set FROM vw_applications
                  WHERE tag_set <> '(sem tag)'
                  GROUP BY 1 HAVING count(*) >= 2)
ORDER BY tag_set, data;

-- @card 3.3 — Delta da última medição vs a anterior (tabela — o "andou quanto?")
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
seq AS (
  SELECT tag_set, application_id, data, pct_concluido, itens_concluidos, total_itens,
         LAG(pct_concluido)    OVER w AS pct_anterior,
         LAG(itens_concluidos) OVER w AS itens_anterior,
         LAG(data)             OVER w AS data_anterior,
         ROW_NUMBER() OVER (PARTITION BY tag_set ORDER BY data DESC, created_at DESC) AS rn
  FROM vw_applications
  WHERE tag_set <> '(sem tag)'
  WINDOW w AS (PARTITION BY tag_set ORDER BY data, created_at)
)
SELECT tag_set,
       data::date            AS medicao_atual,
       data_anterior::date   AS medicao_anterior,
       pct_anterior,
       pct_concluido         AS pct_atual,
       ROUND(pct_concluido - pct_anterior, 1)        AS delta_pp,
       itens_concluidos - itens_anterior             AS itens_a_mais,
       EXTRACT(DAY FROM data - data_anterior)::int   AS dias_entre,
       ROUND((pct_concluido - pct_anterior)
             / NULLIF(EXTRACT(DAY FROM data - data_anterior), 0), 2) AS pp_por_dia
FROM seq
WHERE rn = 1 AND pct_anterior IS NOT NULL
ORDER BY delta_pp DESC NULLS LAST;

-- @card 3.4 — Frentes estagnadas (delta ≈ 0 ou sem medição recente)
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
seq AS (
  SELECT tag_set, data, pct_concluido,
         LAG(pct_concluido) OVER (PARTITION BY tag_set ORDER BY data, created_at) AS pct_anterior,
         ROW_NUMBER()       OVER (PARTITION BY tag_set ORDER BY data DESC, created_at DESC) AS rn
  FROM vw_applications WHERE tag_set <> '(sem tag)'
)
SELECT tag_set,
       data::date AS ultima_medicao,
       EXTRACT(DAY FROM now() - data)::int AS dias_sem_medir,
       pct_concluido,
       ROUND(COALESCE(pct_concluido - pct_anterior, 0), 1) AS delta_pp
FROM seq
WHERE rn = 1
  AND (COALESCE(pct_concluido - pct_anterior, 0) <= 0 OR data < now() - interval '14 days')
  AND pct_concluido < 100
ORDER BY dias_sem_medir DESC;

-- @card 3.5 — Item a item: o que andou entre as duas últimas medições
--   Casa os itens pelo título (o app cria os itens a partir do mesmo checklist).
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
ranked AS (
  SELECT tag_set, application_id, data,
         ROW_NUMBER() OVER (PARTITION BY tag_set ORDER BY data DESC, created_at DESC) AS rn
  FROM vw_applications WHERE tag_set <> '(sem tag)'
),
atual    AS (SELECT r.tag_set, i.item_titulo, i.concluido, i.resposta FROM ranked r JOIN vw_application_items i ON i.application_id = r.application_id WHERE r.rn = 1),
anterior AS (SELECT r.tag_set, i.item_titulo, i.concluido, i.resposta FROM ranked r JOIN vw_application_items i ON i.application_id = r.application_id WHERE r.rn = 2)
SELECT COALESCE(a.tag_set, b.tag_set) AS tag_set,
       COALESCE(a.item_titulo, b.item_titulo) AS item,
       b.resposta AS antes,
       a.resposta AS agora,
       CASE
         WHEN b.item_titulo IS NULL                          THEN 'item novo'
         WHEN a.concluido AND NOT b.concluido                THEN 'AVANÇOU'
         WHEN NOT a.concluido AND b.concluido                THEN 'REGREDIU'
         WHEN a.concluido AND b.concluido                    THEN 'já estava pronto'
         ELSE 'segue pendente'
       END AS movimento
FROM atual a
FULL JOIN anterior b ON b.tag_set = a.tag_set AND b.item_titulo = a.item_titulo
ORDER BY tag_set, movimento, item;

-- @card 3.6 — Avanço por grupo dentro da frente (barras; grupo = prefixo "Cozinha: ")
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
ultima AS (
  SELECT application_id, tag_set
  FROM (SELECT application_id, tag_set,
               ROW_NUMBER() OVER (PARTITION BY tag_set ORDER BY data DESC, created_at DESC) rn
        FROM vw_applications WHERE tag_set <> '(sem tag)') x
  WHERE rn = 1
)
SELECT u.tag_set,
       COALESCE(i.grupo, '(sem grupo)') AS grupo,
       count(*)                          AS itens,
       count(*) FILTER (WHERE i.concluido) AS concluidos,
       ROUND(100.0 * count(*) FILTER (WHERE i.concluido) / count(*), 1) AS pct
FROM ultima u
JOIN vw_application_items i ON i.application_id = u.application_id
GROUP BY 1, 2
ORDER BY 1, pct;

-- @card 3.7 — Esforço x resultado por frente (dispersão: fotos/minutos vs pp ganhos)
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
SELECT tag_set,
       count(*)                  AS medicoes,
       sum(fotos)                AS fotos,
       sum(minutos_em_campo)     AS minutos_totais,
       max(pct_concluido) - min(pct_concluido) AS pp_ganhos
FROM vw_applications
WHERE tag_set <> '(sem tag)'
GROUP BY 1
HAVING count(*) >= 2
ORDER BY pp_ganhos DESC;
