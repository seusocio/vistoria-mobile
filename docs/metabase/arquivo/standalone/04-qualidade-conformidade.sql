-- ---------------------------------------------------------------------
-- DASHBOARD 4 — QUALIDADE & CONFORMIDADE   (como foi feito)
-- VERSÃO STANDALONE — cole um card inteiro no editor nativo do Metabase.
-- Não precisa criar view nenhuma: o bloco WITH no topo de cada card é a
-- própria definição das views, embutida. Cada card é UM SELECT só, que é
-- o único formato que o editor nativo aceita.
-- ---------------------------------------------------------------------


-- =====================================================================
-- DASHBOARD 4 — QUALIDADE & CONFORMIDADE   (como foi feito)
-- Não é "quanto saiu", é "saiu bom?". Usa o semantic das opções do
-- checklist: positivo = conforme, negativo = não conforme, neutro = parcial.
-- Público: revisão / retrabalho.
-- =====================================================================

-- @card 4.1 — Mix de respostas do período (pizza / barra empilhada)
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
SELECT CASE WHEN NOT respondido   THEN 'pendente'
            WHEN concluido        THEN 'conforme'
            WHEN nao_conforme     THEN 'NÃO CONFORME'
            WHEN parcial          THEN 'parcial'
            ELSE 'resposta fora do checklist' END AS situacao,
       count(*) AS itens,
       ROUND(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM vw_application_items
WHERE data_aplicacao >= now() - interval '30 days'
GROUP BY 1
ORDER BY itens DESC;

-- @card 4.2 — Taxa de não conformidade por checklist (barras)
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
       count(*)                                   AS itens_respondidos,
       count(*) FILTER (WHERE nao_conforme)       AS nao_conformes,
       ROUND(100.0 * count(*) FILTER (WHERE nao_conforme) / count(*), 1) AS pct_nc
FROM vw_application_items
WHERE respondido
GROUP BY 1
HAVING count(*) >= 5
ORDER BY pct_nc DESC;

-- @card 4.3 — Itens que mais reprovam (o retrabalho recorrente)
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
SELECT item_titulo AS item,
       COALESCE(grupo, '(sem grupo)') AS grupo,
       count(*)                             AS vezes_respondido,
       count(*) FILTER (WHERE nao_conforme) AS vezes_nc,
       ROUND(100.0 * count(*) FILTER (WHERE nao_conforme) / count(*), 1) AS pct_nc,
       count(DISTINCT application_id)       AS aplicacoes
FROM vw_application_items
WHERE respondido
GROUP BY 1, 2
HAVING count(*) FILTER (WHERE nao_conforme) > 0
ORDER BY vezes_nc DESC, pct_nc DESC
LIMIT 50;

-- @card 4.4 — Cobertura de evidência: não conformidade tem foto?
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
SELECT CASE WHEN nao_conforme THEN 'não conforme' ELSE 'conforme/parcial' END AS tipo,
       count(*)                          AS itens,
       count(*) FILTER (WHERE fotos > 0) AS com_foto,
       ROUND(100.0 * count(*) FILTER (WHERE fotos > 0) / count(*), 1) AS pct_com_foto,
       count(*) FILTER (WHERE tem_nota)  AS com_nota
FROM vw_application_items
WHERE respondido
GROUP BY 1;

-- @card 4.5 — Fila de workflow (itens não respondidos mas já em movimento)
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
SELECT COALESCE(workflow_status, '(sem status)') AS situacao,
       count(*)                       AS itens,
       count(DISTINCT application_id) AS aplicacoes
FROM vw_application_items
WHERE NOT respondido
GROUP BY 1
ORDER BY itens DESC;

-- @card 4.6 — Itens negados / em revisão, com contexto (tabela de ação)
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
SELECT i.workflow_status AS situacao,
       a.tag_set,
       i.checklist,
       i.item_titulo AS item,
       i.note        AS observacao,
       i.fotos,
       i.updated_at
FROM vw_application_items i
JOIN vw_applications a ON a.application_id = i.application_id
WHERE i.workflow_status IN ('denied', 'in_review')
ORDER BY i.updated_at DESC
LIMIT 100;

-- @card 4.7 — Observações escritas em campo (leitura qualitativa)
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
SELECT a.data::date AS data, a.tag_set, i.item_titulo AS item,
       i.resposta, i.note AS observacao, i.fotos
FROM vw_application_items i
JOIN vw_applications a ON a.application_id = i.application_id
WHERE i.tem_nota
ORDER BY a.data DESC
LIMIT 200;

-- @card 4.8 — Evidências que não subiram (risco de perder foto)
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
SELECT att.upload_status,
       count(*)                            AS anexos,
       count(DISTINCT att.application_id)  AS aplicacoes,
       min(att.created_at)                 AS mais_antigo
FROM attachments att
GROUP BY 1
ORDER BY anexos DESC;
