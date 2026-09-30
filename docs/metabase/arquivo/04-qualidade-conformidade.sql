-- =====================================================================
-- DASHBOARD 4 — QUALIDADE & CONFORMIDADE   (como foi feito)
-- Não é "quanto saiu", é "saiu bom?". Usa o semantic das opções do
-- checklist: positivo = conforme, negativo = não conforme, neutro = parcial.
-- Público: revisão / retrabalho.
-- =====================================================================

-- @card 4.1 — Mix de respostas do período (pizza / barra empilhada)
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
SELECT CASE WHEN nao_conforme THEN 'não conforme' ELSE 'conforme/parcial' END AS tipo,
       count(*)                          AS itens,
       count(*) FILTER (WHERE fotos > 0) AS com_foto,
       ROUND(100.0 * count(*) FILTER (WHERE fotos > 0) / count(*), 1) AS pct_com_foto,
       count(*) FILTER (WHERE tem_nota)  AS com_nota
FROM vw_application_items
WHERE respondido
GROUP BY 1;

-- @card 4.5 — Fila de workflow (itens não respondidos mas já em movimento)
SELECT COALESCE(workflow_status, '(sem status)') AS situacao,
       count(*)                       AS itens,
       count(DISTINCT application_id) AS aplicacoes
FROM vw_application_items
WHERE NOT respondido
GROUP BY 1
ORDER BY itens DESC;

-- @card 4.6 — Itens negados / em revisão, com contexto (tabela de ação)
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
SELECT a.data::date AS data, a.tag_set, i.item_titulo AS item,
       i.resposta, i.note AS observacao, i.fotos
FROM vw_application_items i
JOIN vw_applications a ON a.application_id = i.application_id
WHERE i.tem_nota
ORDER BY a.data DESC
LIMIT 200;

-- @card 4.8 — Evidências que não subiram (risco de perder foto)
SELECT att.upload_status,
       count(*)                            AS anexos,
       count(DISTINCT att.application_id)  AS aplicacoes,
       min(att.created_at)                 AS mais_antigo
FROM attachments att
GROUP BY 1
ORDER BY anexos DESC;
