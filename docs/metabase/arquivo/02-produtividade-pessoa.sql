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
DROP VIEW IF EXISTS vw_applications_autor;
CREATE VIEW vw_applications_autor AS
SELECT v.*,
       COALESCE(u.name, u.email, '(não identificado)') AS autor,
       m.role                                          AS papel
FROM vw_applications v
JOIN applications a ON a.id = v.application_id
LEFT JOIN "user" u  ON u.id = a.created_by
LEFT JOIN member m  ON m.user_id = a.created_by AND m.organization_id = v.org_id;

-- @card 2.1 — Placar da equipe no período (tabela ordenada)
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
SELECT date_trunc('day', data)::date AS dia, autor, count(*) AS aplicacoes
FROM vw_applications_autor
WHERE data >= now() - interval '60 days'
GROUP BY 1, 2
ORDER BY 1;

-- @card 2.3 — Jornada de campo: primeira e última resposta do dia
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
