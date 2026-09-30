-- =====================================================================
-- DASHBOARD 3 — EVOLUÇÃO POR TAG   (a sua ideia central)
-- Duas aplicações com o MESMO conjunto de tags = a mesma frente medida
-- duas vezes. A diferença entre elas é a evolução da obra/serviço.
-- Público: acompanhamento semanal de avanço físico.
-- =====================================================================

-- @card 3.1 — Frentes acompanhadas (tag sets com 2+ medições)
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
WITH seq AS (
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
WITH seq AS (
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
WITH ranked AS (
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
WITH ultima AS (
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
