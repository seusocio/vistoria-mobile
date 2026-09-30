-- =====================================================================
-- DASHBOARD 1 — OPERAÇÃO DIÁRIA   (quando · quantos)
-- Pergunta que responde: "o que saiu de campo hoje/essa semana?"
-- Público: você, todo dia de manhã.
-- =====================================================================

-- @card 1.1 — KPIs do período (Metabase: visualização "Number", 1 por coluna)
SELECT count(*)                                            AS aplicacoes,
       count(*) FILTER (WHERE status = 'completed')        AS concluidas,
       sum(itens_concluidos)                               AS itens_concluidos,
       sum(total_itens)                                    AS itens_previstos,
       ROUND(100.0 * sum(itens_concluidos) / NULLIF(sum(total_itens),0), 1) AS pct_execucao,
       sum(fotos)                                          AS fotos
FROM vw_applications
WHERE data >= now() - interval '30 days';

-- @card 1.2 — Volume por dia (barras empilhadas: status)
SELECT date_trunc('day', data)::date AS dia,
       status,
       count(*) AS aplicacoes
FROM vw_applications
WHERE data >= now() - interval '90 days'
GROUP BY 1, 2
ORDER BY 1;

-- @card 1.3 — Itens efetivamente concluídos por dia (linha)
--  Usa answered_at do item: mede trabalho real, não a data declarada.
SELECT date_trunc('day', answered_at)::date AS dia,
       count(*) FILTER (WHERE concluido)    AS concluidos,
       count(*) FILTER (WHERE nao_conforme) AS nao_conformes,
       count(*) FILTER (WHERE parcial)      AS parciais
FROM vw_application_items
WHERE answered_at >= now() - interval '90 days'
GROUP BY 1
ORDER BY 1;

-- @card 1.4 — Funil de execução do período (barras horizontais)
SELECT 'Itens previstos' AS etapa, sum(total_itens)        AS qtd FROM vw_applications WHERE data >= now() - interval '30 days'
UNION ALL
SELECT 'Itens respondidos',        sum(itens_respondidos)  FROM vw_applications WHERE data >= now() - interval '30 days'
UNION ALL
SELECT 'Itens concluídos',         sum(itens_concluidos)   FROM vw_applications WHERE data >= now() - interval '30 days'
UNION ALL
SELECT 'Itens com foto',           count(*)                FROM vw_application_items
  WHERE fotos > 0 AND data_aplicacao >= now() - interval '30 days';

-- @card 1.5 — Backlog: rascunhos parados (tabela, ordenar por dias_parado)
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
SELECT to_char(answered_at, 'ID-Dy') AS dia_semana,
       EXTRACT(HOUR FROM answered_at)::int AS hora,
       count(*) AS itens
FROM vw_application_items
WHERE answered_at >= now() - interval '90 days'
GROUP BY 1, 2
ORDER BY 1, 2;

-- @card 1.7 — Duração das aplicações (histograma ou tabela)
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
SELECT data::date AS data, checklist, tag_set, status,
       itens_concluidos || '/' || total_itens AS progresso,
       pct_concluido, fotos, minutos_em_campo,
       CASE WHEN usou_voz THEN 'voz' ELSE 'manual' END AS captura,
       repetida_de_outra AS repetiu_galeria
FROM vw_applications
ORDER BY data DESC, created_at DESC
LIMIT 50;
