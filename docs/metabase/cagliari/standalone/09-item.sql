-- Por item do checklist
-- Cada item com quantos foram feitos de quantos, em quais apartamentos, e o total de cada serviço.
--
-- GERADO POR build.py — NÃO EDITE. Edite cards.sql.
-- Cole este arquivo inteiro no editor nativo do Metabase.
--   Uma linha por item (`Base shaft: Cozinha`) e, ao fim de cada serviço,
--   uma linha de TOTAL somando seus locais. Sai de um `GROUPING SETS`:
--   dois níveis de agregação numa passada só, em vez de dois cards.
--   `GROUPING(item) = 1` marca a linha de total.
--   ATENÇÃO ao significado de `feitos_onde` nas duas linhas — são
--   perguntas diferentes, e misturá-las faria a coluna mentir:
--     linha de ITEM  -> apartamentos onde AQUELE item está pronto
--     linha de TOTAL -> apartamentos onde o serviço INTEIRO está pronto,
--                       isto é, nenhum dos seus locais pendente
--   Sem essa distinção, um apartamento com a cozinha pronta e o WC
--   pendente apareceria como "feito" no total de Base shaft.

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
),
base AS (
  SELECT * FROM cag_item
  WHERE 1 = 1

  [[AND checklist_id = {{checklist_id}}]]
  [[AND tags_arr && ARRAY(SELECT btrim(v) FROM unnest(string_to_array({{tags}}, ',')) v)]]
  [[AND pavimento = ANY (SELECT btrim(v)::int FROM unnest(string_to_array({{pavimentos}}, ',')) v)]]
  [[AND prumada = ANY (SELECT btrim(v)::int FROM unnest(string_to_array({{prumadas}}, ',')) v)]]
  [[AND servico = ANY (SELECT btrim(v) FROM unnest(string_to_array({{servicos}}, ',')) v)]]
  [[AND local = ANY (SELECT btrim(v) FROM unnest(string_to_array({{locais}}, ',')) v)]]
),
-- pendência de cada serviço, só para ordenar os blocos: o serviço mais
-- atrasado primeiro, e não em ordem alfabética
ordem AS (
  SELECT servico, count(*) FILTER (WHERE concluido_em IS NULL) AS falta_do_servico
  FROM base GROUP BY servico
),
-- os apartamentos de cada ITEM, nomeados e em ordem natural
onde_item AS (
  SELECT servico, item,
         string_agg(apartamento, ', ' ORDER BY ord NULLS LAST, apartamento)
           FILTER (WHERE feito)                                   AS feitos_onde,
         string_agg(apartamento, ', ' ORDER BY ord NULLS LAST, apartamento)
           FILTER (WHERE NOT feito)                               AS restantes_onde
  FROM (
    SELECT DISTINCT servico, item, apartamento,
           concluido_em IS NOT NULL                               AS feito,
           NULLIF(regexp_replace(apartamento, '\D', '', 'g'), '')::int AS ord
    FROM base WHERE apartamento IS NOT NULL
  ) d
  GROUP BY servico, item
),
-- os apartamentos de cada SERVIÇO: completo = zero itens pendentes nele
onde_servico AS (
  SELECT servico,
         string_agg(apartamento, ', ' ORDER BY ord NULLS LAST, apartamento)
           FILTER (WHERE pendentes = 0)                           AS feitos_onde,
         string_agg(apartamento, ', ' ORDER BY ord NULLS LAST, apartamento)
           FILTER (WHERE pendentes > 0)                           AS restantes_onde
  FROM (
    SELECT servico, apartamento,
           count(*) FILTER (WHERE concluido_em IS NULL)           AS pendentes,
           MIN(NULLIF(regexp_replace(apartamento, '\D', '', 'g'), '')::int) AS ord
    FROM base WHERE apartamento IS NOT NULL
    GROUP BY servico, apartamento
  ) d
  GROUP BY servico
)
SELECT
  CASE WHEN GROUPING(b.item) = 1
       THEN '▸ ' || b.servico || ' — TOTAL'
       ELSE b.item END                                                  AS item,
  count(*) FILTER (WHERE b.concluido_em IS NOT NULL)
    || CASE WHEN count(*) FILTER (WHERE b.concluido_em IS NOT NULL) = 1
            THEN ' feito de ' ELSE ' feitos de ' END
    || count(*)                                                         AS resumo,
  count(*) FILTER (WHERE b.concluido_em IS NULL)                        AS restantes,
  -- uma casa decimal, e não inteiro: com inteiro, 239 de 240 arredonda
  -- para "100%" e some o item que falta. 99,6% não deixa margem.
  ROUND(100.0 * count(*) FILTER (WHERE b.concluido_em IS NOT NULL)
        / count(*), 1)                                                  AS "%",
  CASE WHEN GROUPING(b.item) = 1
       THEN MAX(os.feitos_onde) ELSE MAX(oi.feitos_onde) END            AS feitos_onde,
  CASE WHEN GROUPING(b.item) = 1
       THEN MAX(os.restantes_onde) ELSE MAX(oi.restantes_onde) END      AS restantes_onde,
  count(*) FILTER (WHERE b.concluido_em >= {{data_a}}
                     AND b.concluido_em <= {{data_b}})                  AS feito_no_periodo
FROM base b
JOIN ordem o        ON o.servico  = b.servico
LEFT JOIN onde_item oi ON oi.servico = b.servico AND oi.item = b.item
LEFT JOIN onde_servico os ON os.servico = b.servico
GROUP BY GROUPING SETS (
  (o.falta_do_servico, b.servico, b.item),   -- uma linha por item
  (o.falta_do_servico, b.servico)            -- o total do serviço
)
-- Serviço de um item só (Lixa parede, Gás, Parede Lavanderia) não ganha
-- linha de total: ela repetiria a linha de detalhe palavra por palavra.
HAVING GROUPING(b.item) = 0 OR count(DISTINCT b.item) > 1
ORDER BY o.falta_do_servico DESC,
         b.servico,
         GROUPING(b.item),                    -- o total vai por último no bloco
         restantes DESC,
         b.item;
