-- =====================================================================
-- DASHBOARD 5 — SAÚDE DO CATÁLOGO   (o checklist está bem desenhado?)
-- O denominador dos outros dashboards é o checklist. Se ele estiver ruim,
-- todo indicador de produção está errado. Este dashboard audita isso.
-- Público: quem mantém os checklists.
-- =====================================================================

-- @card 5.1 — Uso por checklist (tabela)
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
SELECT t.label AS tag,
       count(vt.application_id) AS aplicacoes,
       max(a.data)::date        AS ultimo_uso
FROM tags t
LEFT JOIN vw_application_tags vt ON vt.tag_id = t.id
LEFT JOIN vw_applications a      ON a.application_id = vt.application_id
GROUP BY 1
ORDER BY aplicacoes DESC, tag;

-- @card 5.6 — Como a informação entra no app (voz x manual x repetição)
SELECT date_trunc('month', data)::date AS mes,
       count(*)                                        AS aplicacoes,
       count(*) FILTER (WHERE usou_voz)                AS com_transcricao,
       count(*) FILTER (WHERE repetida_de_outra)       AS repetidas_da_galeria,
       sum(fotos)                                      AS fotos
FROM vw_applications
GROUP BY 1
ORDER BY 1;

-- @card 5.7 — Sugestão automática: aceita ou ignorada?
SELECT COALESCE(suggestion_source, '(preenchimento manual)') AS origem,
       count(*)                           AS itens,
       count(*) FILTER (WHERE respondido) AS respondidos,
       ROUND(100.0 * count(*) FILTER (WHERE respondido) / count(*), 1) AS pct_aproveitado
FROM vw_application_items
GROUP BY 1
ORDER BY itens DESC;

-- @card 5.8 — Tamanho do checklist x taxa de conclusão (checklist grande demais?)
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
