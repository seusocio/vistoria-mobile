-- ---------------------------------------------------------------------
-- DASHBOARD 2 — PRODUTIVIDADE POR PESSOA   (quem)
-- VERSÃO STANDALONE — cole um card inteiro no editor nativo do Metabase.
-- Não precisa criar view nenhuma: o bloco WITH no topo de cada card é a
-- própria definição das views, embutida. Cada card é UM SELECT só, que é
-- o único formato que o editor nativo aceita.
-- ---------------------------------------------------------------------


-- =====================================================================
-- DASHBOARD 2 — PRODUTIVIDADE POR PESSOA   (quem)
--
-- !!! PRÉ-REQUISITO: hoje o banco NÃO guarda quem fez a aplicação. !!!
-- `applications` tem org_id e project_id, mas nenhuma coluna de autor.
-- Nenhuma query abaixo funciona antes da migração do bloco 2.0.
-- Depois da migração, os dados só aparecem para aplicações NOVAS —
-- o histórico fica com autor nulo ("(não identificado)").
-- =====================================================================

-- @card 2.0 — MIGRAÇÃO (rodar no vistoria-api, via drizzle; SQL equivalente abaixo)
--   ALTER TABLE applications
--     ADD COLUMN created_by text REFERENCES "user"(id);
--   CREATE INDEX applications_created_by_idx ON applications (created_by);
--
--   -- opcional, mas é o que dá granularidade real (item respondido por quem):
--   ALTER TABLE application_items
--     ADD COLUMN answered_by text REFERENCES "user"(id);
--   CREATE INDEX application_items_answered_by_idx ON application_items (answered_by);
--
--   No app: preencher created_by com o usuário da sessão ao criar a aplicação,
--   e answered_by ao gravar cada resposta.

-- @card 2.0b — VIEW com autor (substitui vw_applications depois da migração)
-- (DDL — não vai no Metabase; ver README)
-- DROP VIEW IF EXISTS vw_applications_autor;
-- CREATE VIEW vw_applications_autor AS
-- SELECT v.*,
--        COALESCE(u.name, u.email, '(não identificado)') AS autor,
--        m.role                                          AS papel
-- FROM vw_applications v
-- JOIN applications a ON a.id = v.application_id
-- LEFT JOIN "user" u  ON u.id = a.created_by
-- LEFT JOIN member m  ON m.user_id = a.created_by AND m.organization_id = v.org_id

-- @card 2.1 — Placar da equipe no período (tabela ordenada)
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
vw_applications_autor AS (
  SELECT v.*,
         COALESCE(u.name, u.email, '(não identificado)') AS autor,
         m.role                                          AS papel
  FROM vw_applications v
  JOIN applications a ON a.id = v.application_id
  LEFT JOIN "user" u  ON u.id = a.created_by
  LEFT JOIN member m  ON m.user_id = a.created_by AND m.organization_id = v.org_id
)
SELECT autor,
       count(*)                                     AS aplicacoes,
       count(*) FILTER (WHERE status='completed')   AS concluidas,
       sum(itens_concluidos)                        AS itens_concluidos,
       sum(total_itens)                             AS itens_previstos,
       ROUND(100.0*sum(itens_concluidos)/NULLIF(sum(total_itens),0),1) AS pct_execucao,
       sum(fotos)                                   AS fotos,
       ROUND(avg(minutos_em_campo),1)               AS minutos_medios,
       count(DISTINCT tag_set) FILTER (WHERE tag_set <> '(sem tag)') AS frentes
FROM vw_applications_autor
WHERE data >= now() - interval '30 days'
GROUP BY 1
ORDER BY itens_concluidos DESC;

-- @card 2.2 — Volume por pessoa por dia (barras empilhadas, série = autor)
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
vw_applications_autor AS (
  SELECT v.*,
         COALESCE(u.name, u.email, '(não identificado)') AS autor,
         m.role                                          AS papel
  FROM vw_applications v
  JOIN applications a ON a.id = v.application_id
  LEFT JOIN "user" u  ON u.id = a.created_by
  LEFT JOIN member m  ON m.user_id = a.created_by AND m.organization_id = v.org_id
)
SELECT date_trunc('day', data)::date AS dia, autor, count(*) AS aplicacoes
FROM vw_applications_autor
WHERE data >= now() - interval '60 days'
GROUP BY 1, 2
ORDER BY 1;

-- @card 2.3 — Jornada de campo: primeira e última resposta do dia
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
vw_applications_autor AS (
  SELECT v.*,
         COALESCE(u.name, u.email, '(não identificado)') AS autor,
         m.role                                          AS papel
  FROM vw_applications v
  JOIN applications a ON a.id = v.application_id
  LEFT JOIN "user" u  ON u.id = a.created_by
  LEFT JOIN member m  ON m.user_id = a.created_by AND m.organization_id = v.org_id
)
SELECT autor,
       date_trunc('day', primeira_resposta)::date AS dia,
       min(primeira_resposta)::time               AS comecou,
       max(ultima_resposta)::time                 AS terminou,
       ROUND(EXTRACT(EPOCH FROM (max(ultima_resposta)-min(primeira_resposta)))/3600.0, 1) AS horas_span,
       sum(itens_concluidos)                      AS itens_concluidos,
       ROUND(sum(itens_concluidos) /
             NULLIF(EXTRACT(EPOCH FROM (max(ultima_resposta)-min(primeira_resposta)))/3600.0, 0), 1) AS itens_por_hora
FROM vw_applications_autor
WHERE primeira_resposta IS NOT NULL
  AND data >= now() - interval '30 days'
GROUP BY 1, 2
ORDER BY dia DESC, autor;

-- @card 2.4 — Ritmo médio: itens por hora, por pessoa (barras)
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
vw_applications_autor AS (
  SELECT v.*,
         COALESCE(u.name, u.email, '(não identificado)') AS autor,
         m.role                                          AS papel
  FROM vw_applications v
  JOIN applications a ON a.id = v.application_id
  LEFT JOIN "user" u  ON u.id = a.created_by
  LEFT JOIN member m  ON m.user_id = a.created_by AND m.organization_id = v.org_id
)
SELECT autor,
       sum(itens_respondidos)                                      AS itens,
       ROUND(sum(minutos_em_campo)/60.0, 1)                        AS horas,
       ROUND(sum(itens_respondidos)/NULLIF(sum(minutos_em_campo)/60.0,0), 1) AS itens_por_hora
FROM vw_applications_autor
WHERE minutos_em_campo > 0
  AND data >= now() - interval '90 days'
GROUP BY 1
HAVING sum(minutos_em_campo) > 0
ORDER BY itens_por_hora DESC;

-- @card 2.5 — Qualidade por pessoa (volume alto com muita NC = atenção)
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
vw_applications_autor AS (
  SELECT v.*,
         COALESCE(u.name, u.email, '(não identificado)') AS autor,
         m.role                                          AS papel
  FROM vw_applications v
  JOIN applications a ON a.id = v.application_id
  LEFT JOIN "user" u  ON u.id = a.created_by
  LEFT JOIN member m  ON m.user_id = a.created_by AND m.organization_id = v.org_id
)
SELECT v.autor,
       count(*)                                  AS itens_respondidos,
       count(*) FILTER (WHERE i.nao_conforme)    AS nao_conformes,
       ROUND(100.0*count(*) FILTER (WHERE i.nao_conforme)/count(*),1) AS pct_nc,
       count(*) FILTER (WHERE i.fotos > 0)       AS com_foto,
       ROUND(100.0*count(*) FILTER (WHERE i.fotos > 0)/count(*),1)    AS pct_com_foto,
       count(*) FILTER (WHERE i.tem_nota)        AS com_nota
FROM vw_application_items i
JOIN vw_applications_autor v ON v.application_id = i.application_id
WHERE i.respondido
GROUP BY 1
ORDER BY itens_respondidos DESC;

-- @card 2.6 — Pendências em aberto por pessoa (quem está com backlog)
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
vw_applications_autor AS (
  SELECT v.*,
         COALESCE(u.name, u.email, '(não identificado)') AS autor,
         m.role                                          AS papel
  FROM vw_applications v
  JOIN applications a ON a.id = v.application_id
  LEFT JOIN "user" u  ON u.id = a.created_by
  LEFT JOIN member m  ON m.user_id = a.created_by AND m.organization_id = v.org_id
)
SELECT autor,
       count(*)                  AS rascunhos,
       sum(itens_pendentes)      AS itens_pendentes,
       min(data)::date           AS mais_antigo,
       max(EXTRACT(DAY FROM now() - updated_at))::int AS dias_parado_max
FROM vw_applications_autor
WHERE status = 'draft'
GROUP BY 1
ORDER BY itens_pendentes DESC;

-- @card 2.7 — Cobertura: quem tocou em cada frente (tabela pivot autor × tag_set)
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
vw_applications_autor AS (
  SELECT v.*,
         COALESCE(u.name, u.email, '(não identificado)') AS autor,
         m.role                                          AS papel
  FROM vw_applications v
  JOIN applications a ON a.id = v.application_id
  LEFT JOIN "user" u  ON u.id = a.created_by
  LEFT JOIN member m  ON m.user_id = a.created_by AND m.organization_id = v.org_id
)
SELECT tag_set, autor, count(*) AS medicoes, max(data)::date AS ultima
FROM vw_applications_autor
WHERE tag_set <> '(sem tag)'
GROUP BY 1, 2
ORDER BY tag_set, medicoes DESC;

-- @card 2.8 — Granularidade fina (SÓ com application_items.answered_by)
--   Troque o autor da aplicação pelo autor da resposta.
-- SELECT COALESCE(u.name, u.email, '(não identificado)') AS quem,
--        date_trunc('day', ai.answered_at)::date          AS dia,
--        count(*)                                         AS itens_respondidos
-- FROM application_items ai
-- LEFT JOIN "user" u ON u.id = ai.answered_by
-- WHERE ai.answered_at >= now() - interval '30 days'
-- GROUP BY 1, 2
-- ORDER BY 2 DESC, 3 DESC;
