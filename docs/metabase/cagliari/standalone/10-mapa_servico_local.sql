-- Mapa serviço × local
-- Onde estão os buracos, cruzando serviço com cômodo — a célula é quanto falta.
--
-- GERADO POR build.py — NÃO EDITE. Edite cards.sql.
-- Cole este arquivo inteiro no editor nativo do Metabase.
--   Transposto no SQL pelo mesmo motivo do Mapa do prédio: o Metabase não
--   faz pivot em pergunta nativa.
--   Os nove locais são os que o `CASE` de `cag_item` produz — um conjunto
--   fechado, definido pelo modelo. `Outros` existe para que um local novo
--   apareça em vez de sumir da tabela em silêncio: se ele aparecer com
--   número, é sinal de que o checklist mudou e esta lista precisa de mais
--   uma coluna.

WITH cag_semantic AS (
  SELECT c.id             AS checklist_id,
         opt->>'label'    AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
cag_vistoria AS MATERIALIZED (
  SELECT
    a.id           AS application_id,
    a.org_id,
    c.project_id,
    p.name         AS projeto,
    a.checklist_id,
    c.title        AS checklist,
    a.date::date   AS dia,
    a.status,
    tg.tags_arr,
    tg.tags,
    tg.apartamento,
    -- pavimento e prumada saem do PRÓPRIO `apartamento`, uma fonte só:
    -- derivá-los em separado deixaria os três discordarem se uma vistoria
    -- algum dia carregar mais de uma tag APT-*.
    regexp_replace(tg.apartamento, '\D', '', 'g')::int / 10 AS pavimento,
    regexp_replace(tg.apartamento, '\D', '', 'g')::int % 10 AS prumada
  FROM applications a
  JOIN checklists c   ON c.id = a.checklist_id
  LEFT JOIN projects p ON p.id = c.project_id
  -- UM lateral por vistoria, que resolve as tags de uma vez.
  --
  -- Antes eram cinco subqueries correlacionadas soltas no SELECT (uma por
  -- coluna de tag). Como esta view é inlinada dentro do join com
  -- `application_items`, o planner as reavaliava UMA VEZ POR ITEM: 6.586
  -- execuções varrendo `tags` inteira, cinco vezes. Era 3,5 s por card.
  -- Agrupadas num lateral só, são 215 execuções — uma por vistoria.
  LEFT JOIN LATERAL (
    SELECT array_agg(rotulo ORDER BY rotulo)                      AS tags_arr,
           string_agg(rotulo, ' · ' ORDER BY rotulo)              AS tags,
           MIN(rotulo) FILTER (WHERE rotulo ~ '^APT-[0-9]+$')     AS apartamento
    FROM (
      SELECT COALESCE(t.label, '(tag removida)') AS rotulo
      FROM unnest(a.tags_ids) AS tid
      LEFT JOIN tags t ON t.id = tid
    ) r
  ) tg ON TRUE
),
cag_frente AS MATERIALIZED (
  SELECT DISTINCT
         checklist_id, checklist, projeto, project_id, org_id,
         tags, tags_arr, apartamento, pavimento, prumada,
         checklist || ' · ' || COALESCE(tags, '(sem tag)') AS frente
  FROM cag_vistoria
),
cag_item AS MATERIALIZED (
  SELECT
    f.org_id, f.project_id, f.projeto,
    f.checklist_id, f.checklist,
    f.tags_arr, f.tags, f.apartamento, f.pavimento, f.prumada, f.frente,
    a.item,
    CASE WHEN sl.servico_raw = 'Gas' THEN 'Gás' ELSE sl.servico_raw END AS servico,
    CASE
      -- serviços que valem pelo apartamento inteiro, não por cômodo
      WHEN sl.servico_raw IN ('Gas', 'Lixa parede') THEN 'Apartamento (todo)'
      -- "Parede Lavanderia: Tipo 3, 6": o sufixo é tipologia, o local é a lavanderia
      WHEN sl.servico_raw = 'Parede Lavanderia'     THEN 'Lavanderia'
      -- "Soleira: WCs" é o mesmo WC de suíte que os outros chamam de WCS
      WHEN lower(sl.local_raw) = 'wcs'              THEN 'WCS'
      WHEN lower(sl.local_raw) = 'wc'               THEN 'WC'
      WHEN lower(sl.local_raw) = 'suite'            THEN 'Suíte'
      ELSE sl.local_raw
    END AS local,
    a.concluido_em,
    a.visto_desde,
    a.visto_ate,
    a.vistorias,
    a.teve_nao_conformidade
  FROM (
    -- agrega pela CHAVE MÍNIMA da frente: checklist + tags + item
    SELECT v.checklist_id,
           v.tags,
           btrim(regexp_replace(i.title, '\s+', ' ', 'g'))                  AS item,
           MIN(v.dia) FILTER (WHERE COALESCE(s.semantic = 'positivo', FALSE)) AS concluido_em,
           MIN(v.dia)                                                        AS visto_desde,
           MAX(v.dia)                                                        AS visto_ate,
           count(DISTINCT v.application_id)                                  AS vistorias,
           BOOL_OR(COALESCE(s.semantic = 'negativo', FALSE))                 AS teve_nao_conformidade
    FROM cag_vistoria v
    JOIN application_items i ON i.application_id = v.application_id
    LEFT JOIN cag_semantic s
           ON s.checklist_id = v.checklist_id AND s.label = i.answer
    GROUP BY 1, 2, 3
  ) a
  JOIN cag_frente f
    ON  f.checklist_id = a.checklist_id
    -- `IS NOT DISTINCT FROM` e não `=`: uma vistoria sem tag nenhuma tem
    -- `tags` NULL, e `NULL = NULL` descartaria a frente inteira em silêncio.
    AND f.tags IS NOT DISTINCT FROM a.tags
  CROSS JOIN LATERAL (
    SELECT btrim(split_part(a.item, ':', 1))                                   AS servico_raw,
           NULLIF(btrim(substring(a.item FROM position(':' IN a.item) + 1)), '') AS local_raw
  ) sl
)
SELECT servico,
       count(*) FILTER (WHERE local = 'Cozinha' AND concluido_em IS NULL)
                                                                          AS "Cozinha",
       count(*) FILTER (WHERE local = 'WC' AND concluido_em IS NULL)
                                                                          AS "WC",
       count(*) FILTER (WHERE local = 'WCS' AND concluido_em IS NULL)
                                                                          AS "WCS",
       count(*) FILTER (WHERE local = 'Churrasqueira' AND concluido_em IS NULL)
                                                                          AS "Churrasqueira",
       count(*) FILTER (WHERE local = 'Lavanderia' AND concluido_em IS NULL)
                                                                          AS "Lavanderia",
       count(*) FILTER (WHERE local = 'Porta de entrada' AND concluido_em IS NULL)
                                                                          AS "Porta de entrada",
       count(*) FILTER (WHERE local = 'Q1' AND concluido_em IS NULL)
                                                                          AS "Q1",
       count(*) FILTER (WHERE local = 'Suíte' AND concluido_em IS NULL)
                                                                          AS "Suíte",
       count(*) FILTER (WHERE local = 'Apartamento (todo)' AND concluido_em IS NULL)
                                                                          AS "Apartamento (todo)",
       count(*) FILTER (WHERE local NOT IN ('Cozinha', 'WC', 'WCS', 'Churrasqueira', 'Lavanderia', 'Porta de entrada', 'Q1', 'Suíte', 'Apartamento (todo)') AND concluido_em IS NULL)
                                                                          AS "Outros",
       count(*) FILTER (WHERE concluido_em IS NULL)                       AS "Total falta"
FROM cag_item
WHERE 1 = 1

  [[AND checklist_id = {{checklist_id}}]]
  [[AND tags_arr && ARRAY(SELECT btrim(v) FROM unnest(string_to_array({{tags}}, ',')) v)]]
  [[AND pavimento = ANY (SELECT btrim(v)::int FROM unnest(string_to_array({{pavimentos}}, ',')) v)]]
  [[AND prumada = ANY (SELECT btrim(v)::int FROM unnest(string_to_array({{prumadas}}, ',')) v)]]
  [[AND servico = ANY (SELECT btrim(v) FROM unnest(string_to_array({{servicos}}, ',')) v)]]
GROUP BY servico
ORDER BY "Total falta" DESC, servico;

-- ---------------------------------------------------------------------
-- QUANDO
-- ---------------------------------------------------------------------;
