-- ---------------------------------------------------------------------
-- DASHBOARD 1 — OPERAÇÃO DIÁRIA   (quando · quantos)
-- VERSÃO STANDALONE — cole um card inteiro no editor nativo do Metabase.
-- Não precisa criar view nenhuma: o bloco WITH no topo de cada card é a
-- própria definição das views, embutida. Cada card é UM SELECT só, que é
-- o único formato que o editor nativo aceita.
-- ---------------------------------------------------------------------


-- =====================================================================
-- DASHBOARD 1 — OPERAÇÃO DIÁRIA   (quando · quantos)
-- Pergunta que responde: "o que saiu de campo hoje/essa semana?"
-- Público: você, todo dia de manhã.
-- =====================================================================

-- @card 1.1 — KPIs do período (Metabase: visualização "Number", 1 por coluna)
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
SELECT count(*)                                            AS aplicacoes,
       count(*) FILTER (WHERE status = 'completed')        AS concluidas,
       sum(itens_concluidos)                               AS itens_concluidos,
       sum(total_itens)                                    AS itens_previstos,
       ROUND(100.0 * sum(itens_concluidos) / NULLIF(sum(total_itens),0), 1) AS pct_execucao,
       sum(fotos)                                          AS fotos
FROM vw_applications
WHERE data >= now() - interval '30 days';

-- @card 1.2 — Volume por dia (barras empilhadas: status)
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
SELECT date_trunc('day', data)::date AS dia,
       status,
       count(*) AS aplicacoes
FROM vw_applications
WHERE data >= now() - interval '90 days'
GROUP BY 1, 2
ORDER BY 1;

-- @card 1.3 — Itens efetivamente concluídos por dia (linha)
--  Usa answered_at do item: mede trabalho real, não a data declarada.
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
SELECT date_trunc('day', answered_at)::date AS dia,
       count(*) FILTER (WHERE concluido)    AS concluidos,
       count(*) FILTER (WHERE nao_conforme) AS nao_conformes,
       count(*) FILTER (WHERE parcial)      AS parciais
FROM vw_application_items
WHERE answered_at >= now() - interval '90 days'
GROUP BY 1
ORDER BY 1;

-- @card 1.4 — Funil de execução do período (barras horizontais)
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
SELECT 'Itens previstos' AS etapa, sum(total_itens)        AS qtd FROM vw_applications WHERE data >= now() - interval '30 days'
UNION ALL
SELECT 'Itens respondidos',        sum(itens_respondidos)  FROM vw_applications WHERE data >= now() - interval '30 days'
UNION ALL
SELECT 'Itens concluídos',         sum(itens_concluidos)   FROM vw_applications WHERE data >= now() - interval '30 days'
UNION ALL
SELECT 'Itens com foto',           count(*)                FROM vw_application_items
  WHERE fotos > 0 AND data_aplicacao >= now() - interval '30 days';

-- @card 1.5 — Backlog: rascunhos parados (tabela, ordenar por dias_parado)
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
SELECT application_id,
       checklist,
       tag_set,
       data::date                                   AS data,
       pct_concluido,
       itens_pendentes,
       EXTRACT(DAY FROM now() - updated_at)::int    AS dias_parado
FROM vw_applications
WHERE status = 'draft'
  AND updated_at < now() - interval '3 days'
ORDER BY dias_parado DESC
LIMIT 100;

-- @card 1.6 — Ritmo de campo: dia da semana × hora (heatmap / pivot)
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
SELECT to_char(answered_at, 'ID-Dy') AS dia_semana,
       EXTRACT(HOUR FROM answered_at)::int AS hora,
       count(*) AS itens
FROM vw_application_items
WHERE answered_at >= now() - interval '90 days'
GROUP BY 1, 2
ORDER BY 1, 2;

-- @card 1.7 — Duração das aplicações (histograma ou tabela)
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
SELECT width_bucket(minutos_em_campo, 0, 240, 8) AS faixa,
       CASE width_bucket(minutos_em_campo, 0, 240, 8)
         WHEN 1 THEN '0-30min'  WHEN 2 THEN '30-60min' WHEN 3 THEN '1-1.5h'
         WHEN 4 THEN '1.5-2h'   WHEN 5 THEN '2-2.5h'   WHEN 6 THEN '2.5-3h'
         WHEN 7 THEN '3-3.5h'   WHEN 8 THEN '3.5-4h'   ELSE '4h+'
       END AS duracao,
       count(*) AS aplicacoes
FROM vw_applications
WHERE minutos_em_campo IS NOT NULL
  AND data >= now() - interval '90 days'
GROUP BY 1, 2
ORDER BY 1;

-- @card 1.8 — Últimas 50 aplicações (tabela de auditoria)
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
SELECT data::date AS data, checklist, tag_set, status,
       itens_concluidos || '/' || total_itens AS progresso,
       pct_concluido, fotos, minutos_em_campo,
       CASE WHEN usou_voz THEN 'voz' ELSE 'manual' END AS captura,
       repetida_de_outra AS repetiu_galeria
FROM vw_applications
ORDER BY data DESC, created_at DESC
LIMIT 50;
