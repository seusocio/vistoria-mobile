-- ---------------------------------------------------------------------
-- LEVANTAMENTO DE OBRA
-- VERSÃO STANDALONE — GERADA POR gen.py, NÃO EDITE.
-- Cole um card inteiro no editor nativo do Metabase: o bloco WITH no topo
-- é a definição das views embutida, então não é preciso criar view nenhuma.
-- ---------------------------------------------------------------------


-- =====================================================================
-- LEVANTAMENTO DE OBRA
--
-- Substitui o dashboard 10. Mesma base cumulativa, três correções e um
-- enxugamento de 23 para 12 cards.
--
-- A PREMISSA, e nada além dela:
--   quando · qual · quantos feitos · quantos faltam · % até finalizar
--   · onde falta · onde foi feito
--
-- A IDEIA QUE UNIFICA: uma decomposição só, repetida em TODO eixo de
-- agrupamento. Serviço, local, frente e item respondem com as mesmas
-- cinco colunas:
--
--     previsto · já estava pronto · feito no período · falta · %
--
-- É isso que faltava no 10: lá o local só aparecia nos cards de "onde
-- falta", o item não tinha card nenhum, e cada gráfico recortava o dado
-- de um jeito diferente. Aqui os quatro eixos são intercambiáveis e os
-- totais fecham entre eles — a soma de qualquer eixo dá 1800.
--
-- O QUE MUDOU EM RELAÇÃO AO 10
--
--  1. SERVIÇO E LOCAL NORMALIZADOS PARA OS 30 ITENS. O `split_part` cru
--     acertava 26 e errava 4, e os 4 vazavam para todo card de serviço:
--
--       Soleira: WCs              -> local "WCs", separado de "WCS"
--       Gas: Chumbar              -> local "Chumbar", que não é lugar
--       Parede Lavanderia: Tipo 3, 6 -> local "Tipo 3, 6", que é tipologia
--       Lixa parede               -> sem ":", caía no balde "—"
--
--     Agora os 30 itens caem num par (serviço, local) válido: 10 serviços
--     × 9 locais, zero órfãos. Os três serviços que valem pelo apartamento
--     inteiro (Gás, Lixa parede, Parede Lavanderia) ganham local próprio
--     em vez de sumir.
--
--  2. O ITEM É CHAVEADO PELO TÍTULO, não pelo `checklist_item_id`. O
--     checklist foi reeditado em algum momento e existem DUAS famílias de
--     id para o mesmo bloco de Contramarco (`citem_muey5bdl*` e
--     `citem_mucmjxs4*`). As 34 vistorias de 24/09 carregam as duas, então
--     o escopo do Contramarco aparecia como 376 onde são 240, e como o
--     bloco duplicado estava todo "Sim", o dashboard 10 INFLAVA o
--     progresso da obra: 46,3% contra os 42,4% reais.
--
--     Com a chave por título: 60 frentes × 30 itens = 1800, exato.
--
--  3. SEM O FILTRO DE CHECKLIST. Só existe um checklist no banco hoje
--     ("Vistoria de apartamentos"); "Áreas comuns" não existe mais. E os
--     filtros de frente/serviço/local deixam de ter default, então o
--     dashboard abre na obra inteira e o drill-down é escolha sua. Era o
--     default obrigatório que fazia dois filtros se anularem em silêncio.
--
-- O QUE FICOU DE FORA DO 10, DE PROPÓSITO
--   Gantt (10.12/10.13) - o deslocamento é zero em todas as linhas, não
--     informa nada e não está na premissa.
--   Porte dos checklists (10.14) - só há um checklist.
--   Pares "quais tags" (10.21/10.22/10.23) - virou a coluna `onde`, que
--     já vem dentro do próprio card agregado.
--   Pizza por frente (10.2), item a item (10.5), visão geral (10.7) -
--     redundantes com os cards por eixo.
-- =====================================================================

-- DROP VIEW IF EXISTS vw_obra_item CASCADE;
-- DROP VIEW IF EXISTS vw_obra_vistoria CASCADE;
-- DROP VIEW IF EXISTS vw_obra_semantic CASCADE;

-- label da resposta -> semantic, por checklist.
-- CREATE VIEW vw_obra_semantic AS
-- SELECT c.id             AS checklist_id,
--        opt->>'label'    AS label,
--        opt->>'semantic' AS semantic
-- FROM checklists c,
--      LATERAL jsonb_array_elements(c.options) AS opt;

-- Cada vistoria com a identidade da frente resolvida.
-- Frente = checklist + conjunto de tags. A tag sozinha não serve: a mesma
-- tag pode pertencer a checklists diferentes, com denominadores diferentes.
-- CREATE VIEW vw_obra_vistoria AS
-- SELECT a.id          AS application_id,
--        a.org_id,
--        a.checklist_id,
--        c.title       AS checklist,
--        a.date::date  AS dia,
--        COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
--                  FROM unnest(a.tags_ids) AS tid
--                  LEFT JOIN tags t ON t.id = tid),
--                 '(sem tag)') AS frente
-- FROM applications a
-- JOIN checklists c ON c.id = a.checklist_id;

-- UM ITEM POR FRENTE (não por vistoria), com a data em que ficou pronto.
--
-- O progresso é cumulativo: um item concluído continua concluído nas
-- vistorias seguintes, então o que importa é `concluido_em` — a PRIMEIRA
-- vistoria em que ele apareceu concluído. NULL = nunca foi concluído.
--
-- A data é sempre `applications.date`, nunca `answered_at`: no banco o
-- `answered_at` guarda a hora em que a linha foi gravada, não a do serviço.
-- CREATE VIEW vw_obra_item AS
-- SELECT
--   r.frente,
--   r.checklist,
--   r.org_id,
--   r.item,
--   CASE WHEN r.servico_raw = 'Gas' THEN 'Gás' ELSE r.servico_raw END AS servico,
--   CASE
    -- serviços que valem pelo apartamento inteiro, não por cômodo
--     WHEN r.servico_raw IN ('Gas', 'Lixa parede') THEN 'Apartamento (todo)'
    -- "Parede Lavanderia: Tipo 3, 6" — o sufixo é tipologia, o local é a lavanderia
--     WHEN r.servico_raw = 'Parede Lavanderia'     THEN 'Lavanderia'
    -- "Soleira: WCs" é o mesmo WC de suíte que os outros serviços chamam de WCS
--     WHEN lower(r.local_raw) = 'wcs'              THEN 'WCS'
--     WHEN lower(r.local_raw) = 'wc'               THEN 'WC'
--     WHEN lower(r.local_raw) = 'suite'            THEN 'Suíte'
--     ELSE r.local_raw
--   END AS local,
--   MIN(r.dia) FILTER (WHERE r.concluido)  AS concluido_em,
--   MIN(r.dia)                             AS visto_desde,
--   BOOL_OR(r.nao_conforme)                AS teve_nao_conformidade
-- FROM (
--   SELECT
--     n.frente, n.checklist, n.org_id, n.dia, n.item, n.concluido, n.nao_conforme,
--     btrim(split_part(n.item, ':', 1)) AS servico_raw,
--     NULLIF(btrim(substring(n.item FROM position(':' IN n.item) + 1)), '') AS local_raw
--   FROM (
--     SELECT
--       v.frente, v.checklist, v.org_id, v.dia,
      -- chave do item: o título normalizado. Alguns vieram gravados com
      -- espaço duplo ("Forro gesso:  WC"); `regexp_replace` os reúne.
--       btrim(regexp_replace(i.title, '\s+', ' ', 'g')) AS item,
--       COALESCE(s.semantic = 'positivo', FALSE) AS concluido,
--       COALESCE(s.semantic = 'negativo', FALSE) AS nao_conforme
--     FROM vw_obra_vistoria v
--     JOIN application_items i ON i.application_id = v.application_id
--     LEFT JOIN vw_obra_semantic s
--            ON s.checklist_id = v.checklist_id AND s.label = i.answer
--   ) n
-- ) r
-- GROUP BY 1, 2, 3, 4, 5, 6;

-- ---------------------------------------------------------------------
-- CARDS
--
-- Filtros do dashboard: {{data_a}} {{data_b}} (com default, vindos do
-- banco) e {{frente}} {{servico}} {{local}} (SEM default, opcionais).
--
-- A regra dos filtros: um card que agrupa POR um eixo não filtra por esse
-- eixo — senão o gráfico vira uma barra só. E como frente/serviço/local
-- não têm default, combinar dois deles é escolha explícita sua, não uma
-- armadilha que zera o card sozinho.
--
-- As três faixas, sempre nesta ordem e sempre nestas cores:
--   1 · já estava pronto  azul  #2A78D6   concluído antes de {{data_a}}
--   2 · feito no período  verde #1BAF7A   entre {{data_a}} e {{data_b}}
--   3 · falta             âmbar #EB6834   nunca concluído (ou depois de B)
-- ---------------------------------------------------------------------

-- @card 11.1 — Placar da obra
--   O número da obra em uma linha. Escopo, feitos, faltam, % e o que falta
--   para fechar. Visualization → Table.
WITH vw_obra_semantic AS (
  SELECT c.id             AS checklist_id,
         opt->>'label'    AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_obra_vistoria AS (
  SELECT a.id          AS application_id,
         a.org_id,
         a.checklist_id,
         c.title       AS checklist,
         a.date::date  AS dia,
         COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
                   FROM unnest(a.tags_ids) AS tid
                   LEFT JOIN tags t ON t.id = tid),
                  '(sem tag)') AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_obra_item AS (
  SELECT
    r.frente,
    r.checklist,
    r.org_id,
    r.item,
    CASE WHEN r.servico_raw = 'Gas' THEN 'Gás' ELSE r.servico_raw END AS servico,
    CASE
      -- serviços que valem pelo apartamento inteiro, não por cômodo
      WHEN r.servico_raw IN ('Gas', 'Lixa parede') THEN 'Apartamento (todo)'
      -- "Parede Lavanderia: Tipo 3, 6" — o sufixo é tipologia, o local é a lavanderia
      WHEN r.servico_raw = 'Parede Lavanderia'     THEN 'Lavanderia'
      -- "Soleira: WCs" é o mesmo WC de suíte que os outros serviços chamam de WCS
      WHEN lower(r.local_raw) = 'wcs'              THEN 'WCS'
      WHEN lower(r.local_raw) = 'wc'               THEN 'WC'
      WHEN lower(r.local_raw) = 'suite'            THEN 'Suíte'
      ELSE r.local_raw
    END AS local,
    MIN(r.dia) FILTER (WHERE r.concluido)  AS concluido_em,
    MIN(r.dia)                             AS visto_desde,
    BOOL_OR(r.nao_conforme)                AS teve_nao_conformidade
  FROM (
    SELECT
      n.frente, n.checklist, n.org_id, n.dia, n.item, n.concluido, n.nao_conforme,
      btrim(split_part(n.item, ':', 1)) AS servico_raw,
      NULLIF(btrim(substring(n.item FROM position(':' IN n.item) + 1)), '') AS local_raw
    FROM (
      SELECT
        v.frente, v.checklist, v.org_id, v.dia,
        -- chave do item: o título normalizado. Alguns vieram gravados com
        -- espaço duplo ("Forro gesso:  WC"); `regexp_replace` os reúne.
        btrim(regexp_replace(i.title, '\s+', ' ', 'g')) AS item,
        COALESCE(s.semantic = 'positivo', FALSE) AS concluido,
        COALESCE(s.semantic = 'negativo', FALSE) AS nao_conforme
      FROM vw_obra_vistoria v
      JOIN application_items i ON i.application_id = v.application_id
      LEFT JOIN vw_obra_semantic s
             ON s.checklist_id = v.checklist_id AND s.label = i.answer
    ) n
  ) r
  GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT
  count(*)                                                           AS previsto,
  count(*) FILTER (WHERE concluido_em IS NOT NULL)                   AS feitos,
  count(*) FILTER (WHERE concluido_em IS NULL)                       AS falta,
  ROUND(100.0 * count(*) FILTER (WHERE concluido_em IS NOT NULL)
        / count(*), 1)                                               AS pct_concluido,
  ROUND(100.0 * count(*) FILTER (WHERE concluido_em IS NULL)
        / count(*), 1)                                               AS pct_restante,
  count(DISTINCT frente)                                             AS frentes,
  count(DISTINCT servico)                                            AS servicos,
  count(DISTINCT frente) FILTER (WHERE concluido_em IS NULL)         AS frentes_com_pendencia,
  count(*) FILTER (WHERE concluido_em >= {{data_a}}
                     AND concluido_em <= {{data_b}})                 AS avanco_no_periodo,
  MAX(concluido_em)                                                  AS ultimo_avanco
FROM vw_obra_item
WHERE 1 = 1
  [[AND frente = {{frente}}]]
  [[AND servico = {{servico}}]]
  [[AND local = {{local}}]];

-- @card 11.2 — Quanto da obra está pronto
--   A pizza do escopo inteiro: quanto já estava pronto, quanto andou no
--   período, quanto falta. Visualization → Pie.
WITH vw_obra_semantic AS (
  SELECT c.id             AS checklist_id,
         opt->>'label'    AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_obra_vistoria AS (
  SELECT a.id          AS application_id,
         a.org_id,
         a.checklist_id,
         c.title       AS checklist,
         a.date::date  AS dia,
         COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
                   FROM unnest(a.tags_ids) AS tid
                   LEFT JOIN tags t ON t.id = tid),
                  '(sem tag)') AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_obra_item AS (
  SELECT
    r.frente,
    r.checklist,
    r.org_id,
    r.item,
    CASE WHEN r.servico_raw = 'Gas' THEN 'Gás' ELSE r.servico_raw END AS servico,
    CASE
      -- serviços que valem pelo apartamento inteiro, não por cômodo
      WHEN r.servico_raw IN ('Gas', 'Lixa parede') THEN 'Apartamento (todo)'
      -- "Parede Lavanderia: Tipo 3, 6" — o sufixo é tipologia, o local é a lavanderia
      WHEN r.servico_raw = 'Parede Lavanderia'     THEN 'Lavanderia'
      -- "Soleira: WCs" é o mesmo WC de suíte que os outros serviços chamam de WCS
      WHEN lower(r.local_raw) = 'wcs'              THEN 'WCS'
      WHEN lower(r.local_raw) = 'wc'               THEN 'WC'
      WHEN lower(r.local_raw) = 'suite'            THEN 'Suíte'
      ELSE r.local_raw
    END AS local,
    MIN(r.dia) FILTER (WHERE r.concluido)  AS concluido_em,
    MIN(r.dia)                             AS visto_desde,
    BOOL_OR(r.nao_conforme)                AS teve_nao_conformidade
  FROM (
    SELECT
      n.frente, n.checklist, n.org_id, n.dia, n.item, n.concluido, n.nao_conforme,
      btrim(split_part(n.item, ':', 1)) AS servico_raw,
      NULLIF(btrim(substring(n.item FROM position(':' IN n.item) + 1)), '') AS local_raw
    FROM (
      SELECT
        v.frente, v.checklist, v.org_id, v.dia,
        -- chave do item: o título normalizado. Alguns vieram gravados com
        -- espaço duplo ("Forro gesso:  WC"); `regexp_replace` os reúne.
        btrim(regexp_replace(i.title, '\s+', ' ', 'g')) AS item,
        COALESCE(s.semantic = 'positivo', FALSE) AS concluido,
        COALESCE(s.semantic = 'negativo', FALSE) AS nao_conforme
      FROM vw_obra_vistoria v
      JOIN application_items i ON i.application_id = v.application_id
      LEFT JOIN vw_obra_semantic s
             ON s.checklist_id = v.checklist_id AND s.label = i.answer
    ) n
  ) r
  GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT faixa, itens FROM (
  SELECT '1 · Já estava pronto' AS faixa, count(*) AS itens, 1 AS ord
    FROM vw_obra_item
   WHERE concluido_em < {{data_a}}
     [[AND frente = {{frente}}]] [[AND servico = {{servico}}]] [[AND local = {{local}}]]
  UNION ALL
  SELECT '2 · Feito no período', count(*), 2
    FROM vw_obra_item
   WHERE concluido_em >= {{data_a}} AND concluido_em <= {{data_b}}
     [[AND frente = {{frente}}]] [[AND servico = {{servico}}]] [[AND local = {{local}}]]
  UNION ALL
  SELECT '3 · Falta', count(*), 3
    FROM vw_obra_item
   WHERE (concluido_em IS NULL OR concluido_em > {{data_b}})
     [[AND frente = {{frente}}]] [[AND servico = {{servico}}]] [[AND local = {{local}}]]
) p ORDER BY ord;

-- ---------------------------------------------------------------------
-- QUANDO
-- ---------------------------------------------------------------------;

-- @card 11.3 — Quando a obra andou
--   Uma linha por data de vistoria: quanto estava pronto naquele dia, em
--   itens e em %. Sobe e nunca desce. Visualization → Line, eixo = dia.
WITH vw_obra_vistoria AS (
  SELECT a.id          AS application_id,
         a.org_id,
         a.checklist_id,
         c.title       AS checklist,
         a.date::date  AS dia,
         COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
                   FROM unnest(a.tags_ids) AS tid
                   LEFT JOIN tags t ON t.id = tid),
                  '(sem tag)') AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_obra_semantic AS (
  SELECT c.id             AS checklist_id,
         opt->>'label'    AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_obra_item AS (
  SELECT
    r.frente,
    r.checklist,
    r.org_id,
    r.item,
    CASE WHEN r.servico_raw = 'Gas' THEN 'Gás' ELSE r.servico_raw END AS servico,
    CASE
      -- serviços que valem pelo apartamento inteiro, não por cômodo
      WHEN r.servico_raw IN ('Gas', 'Lixa parede') THEN 'Apartamento (todo)'
      -- "Parede Lavanderia: Tipo 3, 6" — o sufixo é tipologia, o local é a lavanderia
      WHEN r.servico_raw = 'Parede Lavanderia'     THEN 'Lavanderia'
      -- "Soleira: WCs" é o mesmo WC de suíte que os outros serviços chamam de WCS
      WHEN lower(r.local_raw) = 'wcs'              THEN 'WCS'
      WHEN lower(r.local_raw) = 'wc'               THEN 'WC'
      WHEN lower(r.local_raw) = 'suite'            THEN 'Suíte'
      ELSE r.local_raw
    END AS local,
    MIN(r.dia) FILTER (WHERE r.concluido)  AS concluido_em,
    MIN(r.dia)                             AS visto_desde,
    BOOL_OR(r.nao_conforme)                AS teve_nao_conformidade
  FROM (
    SELECT
      n.frente, n.checklist, n.org_id, n.dia, n.item, n.concluido, n.nao_conforme,
      btrim(split_part(n.item, ':', 1)) AS servico_raw,
      NULLIF(btrim(substring(n.item FROM position(':' IN n.item) + 1)), '') AS local_raw
    FROM (
      SELECT
        v.frente, v.checklist, v.org_id, v.dia,
        -- chave do item: o título normalizado. Alguns vieram gravados com
        -- espaço duplo ("Forro gesso:  WC"); `regexp_replace` os reúne.
        btrim(regexp_replace(i.title, '\s+', ' ', 'g')) AS item,
        COALESCE(s.semantic = 'positivo', FALSE) AS concluido,
        COALESCE(s.semantic = 'negativo', FALSE) AS nao_conforme
      FROM vw_obra_vistoria v
      JOIN application_items i ON i.application_id = v.application_id
      LEFT JOIN vw_obra_semantic s
             ON s.checklist_id = v.checklist_id AND s.label = i.answer
    ) n
  ) r
  GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT d.dia,
       (SELECT count(*) FROM vw_obra_item i
         WHERE i.concluido_em = d.dia
           [[AND i.frente = {{frente}}]] [[AND i.servico = {{servico}}]] [[AND i.local = {{local}}]])
                                                                     AS avanco_no_dia,
       (SELECT count(*) FROM vw_obra_item i
         WHERE i.concluido_em <= d.dia
           [[AND i.frente = {{frente}}]] [[AND i.servico = {{servico}}]] [[AND i.local = {{local}}]])
                                                                     AS pronto_ate_a_data,
       (SELECT count(*) FROM vw_obra_item i
         WHERE 1 = 1
           [[AND i.frente = {{frente}}]] [[AND i.servico = {{servico}}]] [[AND i.local = {{local}}]])
                                                                     AS escopo,
       ROUND(100.0 *
         (SELECT count(*) FROM vw_obra_item i
           WHERE i.concluido_em <= d.dia
             [[AND i.frente = {{frente}}]] [[AND i.servico = {{servico}}]] [[AND i.local = {{local}}]])
         / NULLIF((SELECT count(*) FROM vw_obra_item i
           WHERE 1 = 1
             [[AND i.frente = {{frente}}]] [[AND i.servico = {{servico}}]] [[AND i.local = {{local}}]]), 0), 1)
                                                                     AS pct_concluido
FROM (SELECT DISTINCT dia FROM vw_obra_vistoria) d
ORDER BY d.dia;

-- @card 11.4 — Quando cada serviço andou
--   A leitura da linha do tempo aberta por serviço: em 17/09 avançou o quê,
--   em quantos apartamentos, e quais. Visualization → Table.
WITH vw_obra_semantic AS (
  SELECT c.id             AS checklist_id,
         opt->>'label'    AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_obra_vistoria AS (
  SELECT a.id          AS application_id,
         a.org_id,
         a.checklist_id,
         c.title       AS checklist,
         a.date::date  AS dia,
         COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
                   FROM unnest(a.tags_ids) AS tid
                   LEFT JOIN tags t ON t.id = tid),
                  '(sem tag)') AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_obra_item AS (
  SELECT
    r.frente,
    r.checklist,
    r.org_id,
    r.item,
    CASE WHEN r.servico_raw = 'Gas' THEN 'Gás' ELSE r.servico_raw END AS servico,
    CASE
      -- serviços que valem pelo apartamento inteiro, não por cômodo
      WHEN r.servico_raw IN ('Gas', 'Lixa parede') THEN 'Apartamento (todo)'
      -- "Parede Lavanderia: Tipo 3, 6" — o sufixo é tipologia, o local é a lavanderia
      WHEN r.servico_raw = 'Parede Lavanderia'     THEN 'Lavanderia'
      -- "Soleira: WCs" é o mesmo WC de suíte que os outros serviços chamam de WCS
      WHEN lower(r.local_raw) = 'wcs'              THEN 'WCS'
      WHEN lower(r.local_raw) = 'wc'               THEN 'WC'
      WHEN lower(r.local_raw) = 'suite'            THEN 'Suíte'
      ELSE r.local_raw
    END AS local,
    MIN(r.dia) FILTER (WHERE r.concluido)  AS concluido_em,
    MIN(r.dia)                             AS visto_desde,
    BOOL_OR(r.nao_conforme)                AS teve_nao_conformidade
  FROM (
    SELECT
      n.frente, n.checklist, n.org_id, n.dia, n.item, n.concluido, n.nao_conforme,
      btrim(split_part(n.item, ':', 1)) AS servico_raw,
      NULLIF(btrim(substring(n.item FROM position(':' IN n.item) + 1)), '') AS local_raw
    FROM (
      SELECT
        v.frente, v.checklist, v.org_id, v.dia,
        -- chave do item: o título normalizado. Alguns vieram gravados com
        -- espaço duplo ("Forro gesso:  WC"); `regexp_replace` os reúne.
        btrim(regexp_replace(i.title, '\s+', ' ', 'g')) AS item,
        COALESCE(s.semantic = 'positivo', FALSE) AS concluido,
        COALESCE(s.semantic = 'negativo', FALSE) AS nao_conforme
      FROM vw_obra_vistoria v
      JOIN application_items i ON i.application_id = v.application_id
      LEFT JOIN vw_obra_semantic s
             ON s.checklist_id = v.checklist_id AND s.label = i.answer
    ) n
  ) r
  GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT i.concluido_em                        AS dia,
       i.servico,
       count(*)                              AS itens_feitos,
       count(DISTINCT i.frente)              AS frentes,
       string_agg(DISTINCT i.local, ', ' ORDER BY i.local) AS locais,
       ROUND(100.0 * count(*) / NULLIF((SELECT count(*) FROM vw_obra_item x
          WHERE x.servico = i.servico
            [[AND x.frente = {{frente}}]] [[AND x.local = {{local}}]]), 0), 1)
                                             AS pct_do_servico
FROM vw_obra_item i
WHERE i.concluido_em IS NOT NULL
  [[AND i.frente = {{frente}}]]
  [[AND i.servico = {{servico}}]]
  [[AND i.local = {{local}}]]
GROUP BY i.concluido_em, i.servico
ORDER BY i.concluido_em DESC, itens_feitos DESC;

-- ---------------------------------------------------------------------
-- QUAL · QUANTOS · QUANTO FALTA · %
--
-- Os quatro eixos de agrupamento, as mesmas cinco colunas. A soma da
-- coluna `previsto` dá 1800 em qualquer um dos quatro.
-- ---------------------------------------------------------------------;

-- @card 11.5 — Por serviço
--   Visualization → Row, Stack ligado, "Show values" ligado.
WITH vw_obra_semantic AS (
  SELECT c.id             AS checklist_id,
         opt->>'label'    AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_obra_vistoria AS (
  SELECT a.id          AS application_id,
         a.org_id,
         a.checklist_id,
         c.title       AS checklist,
         a.date::date  AS dia,
         COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
                   FROM unnest(a.tags_ids) AS tid
                   LEFT JOIN tags t ON t.id = tid),
                  '(sem tag)') AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_obra_item AS (
  SELECT
    r.frente,
    r.checklist,
    r.org_id,
    r.item,
    CASE WHEN r.servico_raw = 'Gas' THEN 'Gás' ELSE r.servico_raw END AS servico,
    CASE
      -- serviços que valem pelo apartamento inteiro, não por cômodo
      WHEN r.servico_raw IN ('Gas', 'Lixa parede') THEN 'Apartamento (todo)'
      -- "Parede Lavanderia: Tipo 3, 6" — o sufixo é tipologia, o local é a lavanderia
      WHEN r.servico_raw = 'Parede Lavanderia'     THEN 'Lavanderia'
      -- "Soleira: WCs" é o mesmo WC de suíte que os outros serviços chamam de WCS
      WHEN lower(r.local_raw) = 'wcs'              THEN 'WCS'
      WHEN lower(r.local_raw) = 'wc'               THEN 'WC'
      WHEN lower(r.local_raw) = 'suite'            THEN 'Suíte'
      ELSE r.local_raw
    END AS local,
    MIN(r.dia) FILTER (WHERE r.concluido)  AS concluido_em,
    MIN(r.dia)                             AS visto_desde,
    BOOL_OR(r.nao_conforme)                AS teve_nao_conformidade
  FROM (
    SELECT
      n.frente, n.checklist, n.org_id, n.dia, n.item, n.concluido, n.nao_conforme,
      btrim(split_part(n.item, ':', 1)) AS servico_raw,
      NULLIF(btrim(substring(n.item FROM position(':' IN n.item) + 1)), '') AS local_raw
    FROM (
      SELECT
        v.frente, v.checklist, v.org_id, v.dia,
        -- chave do item: o título normalizado. Alguns vieram gravados com
        -- espaço duplo ("Forro gesso:  WC"); `regexp_replace` os reúne.
        btrim(regexp_replace(i.title, '\s+', ' ', 'g')) AS item,
        COALESCE(s.semantic = 'positivo', FALSE) AS concluido,
        COALESCE(s.semantic = 'negativo', FALSE) AS nao_conforme
      FROM vw_obra_vistoria v
      JOIN application_items i ON i.application_id = v.application_id
      LEFT JOIN vw_obra_semantic s
             ON s.checklist_id = v.checklist_id AND s.label = i.answer
    ) n
  ) r
  GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT servico,
       count(*)                                                      AS previsto,
       count(*) FILTER (WHERE concluido_em < {{data_a}})              AS "1 · já estava pronto",
       count(*) FILTER (WHERE concluido_em >= {{data_a}}
                          AND concluido_em <= {{data_b}})             AS "2 · feito no período",
       count(*) FILTER (WHERE concluido_em IS NULL
                          OR concluido_em > {{data_b}})               AS "3 · falta",
       ROUND(100.0 * count(*) FILTER (WHERE concluido_em IS NOT NULL)
             / count(*), 1)                                          AS pct_concluido
FROM vw_obra_item
WHERE 1 = 1
  [[AND frente = {{frente}}]]
  [[AND local = {{local}}]]
GROUP BY servico
ORDER BY "3 · falta" DESC, servico;

-- @card 11.6 — Por local
--   "Como está o WC da obra inteira." No dashboard 10 o local só existia
--   nos cards de pendência; aqui ele é um eixo de primeira classe.
WITH vw_obra_semantic AS (
  SELECT c.id             AS checklist_id,
         opt->>'label'    AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_obra_vistoria AS (
  SELECT a.id          AS application_id,
         a.org_id,
         a.checklist_id,
         c.title       AS checklist,
         a.date::date  AS dia,
         COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
                   FROM unnest(a.tags_ids) AS tid
                   LEFT JOIN tags t ON t.id = tid),
                  '(sem tag)') AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_obra_item AS (
  SELECT
    r.frente,
    r.checklist,
    r.org_id,
    r.item,
    CASE WHEN r.servico_raw = 'Gas' THEN 'Gás' ELSE r.servico_raw END AS servico,
    CASE
      -- serviços que valem pelo apartamento inteiro, não por cômodo
      WHEN r.servico_raw IN ('Gas', 'Lixa parede') THEN 'Apartamento (todo)'
      -- "Parede Lavanderia: Tipo 3, 6" — o sufixo é tipologia, o local é a lavanderia
      WHEN r.servico_raw = 'Parede Lavanderia'     THEN 'Lavanderia'
      -- "Soleira: WCs" é o mesmo WC de suíte que os outros serviços chamam de WCS
      WHEN lower(r.local_raw) = 'wcs'              THEN 'WCS'
      WHEN lower(r.local_raw) = 'wc'               THEN 'WC'
      WHEN lower(r.local_raw) = 'suite'            THEN 'Suíte'
      ELSE r.local_raw
    END AS local,
    MIN(r.dia) FILTER (WHERE r.concluido)  AS concluido_em,
    MIN(r.dia)                             AS visto_desde,
    BOOL_OR(r.nao_conforme)                AS teve_nao_conformidade
  FROM (
    SELECT
      n.frente, n.checklist, n.org_id, n.dia, n.item, n.concluido, n.nao_conforme,
      btrim(split_part(n.item, ':', 1)) AS servico_raw,
      NULLIF(btrim(substring(n.item FROM position(':' IN n.item) + 1)), '') AS local_raw
    FROM (
      SELECT
        v.frente, v.checklist, v.org_id, v.dia,
        -- chave do item: o título normalizado. Alguns vieram gravados com
        -- espaço duplo ("Forro gesso:  WC"); `regexp_replace` os reúne.
        btrim(regexp_replace(i.title, '\s+', ' ', 'g')) AS item,
        COALESCE(s.semantic = 'positivo', FALSE) AS concluido,
        COALESCE(s.semantic = 'negativo', FALSE) AS nao_conforme
      FROM vw_obra_vistoria v
      JOIN application_items i ON i.application_id = v.application_id
      LEFT JOIN vw_obra_semantic s
             ON s.checklist_id = v.checklist_id AND s.label = i.answer
    ) n
  ) r
  GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT local,
       count(*)                                                      AS previsto,
       count(*) FILTER (WHERE concluido_em < {{data_a}})              AS "1 · já estava pronto",
       count(*) FILTER (WHERE concluido_em >= {{data_a}}
                          AND concluido_em <= {{data_b}})             AS "2 · feito no período",
       count(*) FILTER (WHERE concluido_em IS NULL
                          OR concluido_em > {{data_b}})               AS "3 · falta",
       ROUND(100.0 * count(*) FILTER (WHERE concluido_em IS NOT NULL)
             / count(*), 1)                                          AS pct_concluido
FROM vw_obra_item
WHERE 1 = 1
  [[AND frente = {{frente}}]]
  [[AND servico = {{servico}}]]
GROUP BY local
ORDER BY "3 · falta" DESC, local;

-- @card 11.7 — Por frente (apartamento)
WITH vw_obra_semantic AS (
  SELECT c.id             AS checklist_id,
         opt->>'label'    AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_obra_vistoria AS (
  SELECT a.id          AS application_id,
         a.org_id,
         a.checklist_id,
         c.title       AS checklist,
         a.date::date  AS dia,
         COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
                   FROM unnest(a.tags_ids) AS tid
                   LEFT JOIN tags t ON t.id = tid),
                  '(sem tag)') AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_obra_item AS (
  SELECT
    r.frente,
    r.checklist,
    r.org_id,
    r.item,
    CASE WHEN r.servico_raw = 'Gas' THEN 'Gás' ELSE r.servico_raw END AS servico,
    CASE
      -- serviços que valem pelo apartamento inteiro, não por cômodo
      WHEN r.servico_raw IN ('Gas', 'Lixa parede') THEN 'Apartamento (todo)'
      -- "Parede Lavanderia: Tipo 3, 6" — o sufixo é tipologia, o local é a lavanderia
      WHEN r.servico_raw = 'Parede Lavanderia'     THEN 'Lavanderia'
      -- "Soleira: WCs" é o mesmo WC de suíte que os outros serviços chamam de WCS
      WHEN lower(r.local_raw) = 'wcs'              THEN 'WCS'
      WHEN lower(r.local_raw) = 'wc'               THEN 'WC'
      WHEN lower(r.local_raw) = 'suite'            THEN 'Suíte'
      ELSE r.local_raw
    END AS local,
    MIN(r.dia) FILTER (WHERE r.concluido)  AS concluido_em,
    MIN(r.dia)                             AS visto_desde,
    BOOL_OR(r.nao_conforme)                AS teve_nao_conformidade
  FROM (
    SELECT
      n.frente, n.checklist, n.org_id, n.dia, n.item, n.concluido, n.nao_conforme,
      btrim(split_part(n.item, ':', 1)) AS servico_raw,
      NULLIF(btrim(substring(n.item FROM position(':' IN n.item) + 1)), '') AS local_raw
    FROM (
      SELECT
        v.frente, v.checklist, v.org_id, v.dia,
        -- chave do item: o título normalizado. Alguns vieram gravados com
        -- espaço duplo ("Forro gesso:  WC"); `regexp_replace` os reúne.
        btrim(regexp_replace(i.title, '\s+', ' ', 'g')) AS item,
        COALESCE(s.semantic = 'positivo', FALSE) AS concluido,
        COALESCE(s.semantic = 'negativo', FALSE) AS nao_conforme
      FROM vw_obra_vistoria v
      JOIN application_items i ON i.application_id = v.application_id
      LEFT JOIN vw_obra_semantic s
             ON s.checklist_id = v.checklist_id AND s.label = i.answer
    ) n
  ) r
  GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT frente,
       count(*)                                                      AS previsto,
       count(*) FILTER (WHERE concluido_em < {{data_a}})              AS "1 · já estava pronto",
       count(*) FILTER (WHERE concluido_em >= {{data_a}}
                          AND concluido_em <= {{data_b}})             AS "2 · feito no período",
       count(*) FILTER (WHERE concluido_em IS NULL
                          OR concluido_em > {{data_b}})               AS "3 · falta",
       ROUND(100.0 * count(*) FILTER (WHERE concluido_em IS NOT NULL)
             / count(*), 1)                                          AS pct_concluido
FROM vw_obra_item
WHERE 1 = 1
  [[AND servico = {{servico}}]]
  [[AND local = {{local}}]]
GROUP BY frente
--   ordem natural: APT-9 antes de APT-11, não depois (alfabético poria APT-101 primeiro)
ORDER BY "3 · falta" DESC,
         NULLIF(regexp_replace(frente, '\D', '', 'g'), '')::bigint NULLS LAST,
         frente;

-- @card 11.8 — Por item do checklist
--   Uma linha para cada um dos 30 itens, com serviço e local já separados.
--   É este card que responde "isso deveria ser feito para cada item".
WITH vw_obra_semantic AS (
  SELECT c.id             AS checklist_id,
         opt->>'label'    AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_obra_vistoria AS (
  SELECT a.id          AS application_id,
         a.org_id,
         a.checklist_id,
         c.title       AS checklist,
         a.date::date  AS dia,
         COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
                   FROM unnest(a.tags_ids) AS tid
                   LEFT JOIN tags t ON t.id = tid),
                  '(sem tag)') AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_obra_item AS (
  SELECT
    r.frente,
    r.checklist,
    r.org_id,
    r.item,
    CASE WHEN r.servico_raw = 'Gas' THEN 'Gás' ELSE r.servico_raw END AS servico,
    CASE
      -- serviços que valem pelo apartamento inteiro, não por cômodo
      WHEN r.servico_raw IN ('Gas', 'Lixa parede') THEN 'Apartamento (todo)'
      -- "Parede Lavanderia: Tipo 3, 6" — o sufixo é tipologia, o local é a lavanderia
      WHEN r.servico_raw = 'Parede Lavanderia'     THEN 'Lavanderia'
      -- "Soleira: WCs" é o mesmo WC de suíte que os outros serviços chamam de WCS
      WHEN lower(r.local_raw) = 'wcs'              THEN 'WCS'
      WHEN lower(r.local_raw) = 'wc'               THEN 'WC'
      WHEN lower(r.local_raw) = 'suite'            THEN 'Suíte'
      ELSE r.local_raw
    END AS local,
    MIN(r.dia) FILTER (WHERE r.concluido)  AS concluido_em,
    MIN(r.dia)                             AS visto_desde,
    BOOL_OR(r.nao_conforme)                AS teve_nao_conformidade
  FROM (
    SELECT
      n.frente, n.checklist, n.org_id, n.dia, n.item, n.concluido, n.nao_conforme,
      btrim(split_part(n.item, ':', 1)) AS servico_raw,
      NULLIF(btrim(substring(n.item FROM position(':' IN n.item) + 1)), '') AS local_raw
    FROM (
      SELECT
        v.frente, v.checklist, v.org_id, v.dia,
        -- chave do item: o título normalizado. Alguns vieram gravados com
        -- espaço duplo ("Forro gesso:  WC"); `regexp_replace` os reúne.
        btrim(regexp_replace(i.title, '\s+', ' ', 'g')) AS item,
        COALESCE(s.semantic = 'positivo', FALSE) AS concluido,
        COALESCE(s.semantic = 'negativo', FALSE) AS nao_conforme
      FROM vw_obra_vistoria v
      JOIN application_items i ON i.application_id = v.application_id
      LEFT JOIN vw_obra_semantic s
             ON s.checklist_id = v.checklist_id AND s.label = i.answer
    ) n
  ) r
  GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT item,
       servico,
       local,
       count(*)                                                      AS previsto,
       count(*) FILTER (WHERE concluido_em < {{data_a}})              AS "1 · já estava pronto",
       count(*) FILTER (WHERE concluido_em >= {{data_a}}
                          AND concluido_em <= {{data_b}})             AS "2 · feito no período",
       count(*) FILTER (WHERE concluido_em IS NULL
                          OR concluido_em > {{data_b}})               AS "3 · falta",
       ROUND(100.0 * count(*) FILTER (WHERE concluido_em IS NOT NULL)
             / count(*), 1)                                          AS pct_concluido,
       MAX(concluido_em)                                             AS ultimo_avanco
FROM vw_obra_item
WHERE 1 = 1
  [[AND frente = {{frente}}]]
  [[AND servico = {{servico}}]]
  [[AND local = {{local}}]]
GROUP BY item, servico, local
ORDER BY "3 · falta" DESC, servico, local;

-- ---------------------------------------------------------------------
-- ONDE
-- ---------------------------------------------------------------------;

-- @card 11.9 — Mapa serviço × local
--   Os buracos da obra de uma olhada. Visualization → Pivot table:
--   serviço nas linhas, local nas colunas, `falta` na célula.
WITH vw_obra_semantic AS (
  SELECT c.id             AS checklist_id,
         opt->>'label'    AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_obra_vistoria AS (
  SELECT a.id          AS application_id,
         a.org_id,
         a.checklist_id,
         c.title       AS checklist,
         a.date::date  AS dia,
         COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
                   FROM unnest(a.tags_ids) AS tid
                   LEFT JOIN tags t ON t.id = tid),
                  '(sem tag)') AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_obra_item AS (
  SELECT
    r.frente,
    r.checklist,
    r.org_id,
    r.item,
    CASE WHEN r.servico_raw = 'Gas' THEN 'Gás' ELSE r.servico_raw END AS servico,
    CASE
      -- serviços que valem pelo apartamento inteiro, não por cômodo
      WHEN r.servico_raw IN ('Gas', 'Lixa parede') THEN 'Apartamento (todo)'
      -- "Parede Lavanderia: Tipo 3, 6" — o sufixo é tipologia, o local é a lavanderia
      WHEN r.servico_raw = 'Parede Lavanderia'     THEN 'Lavanderia'
      -- "Soleira: WCs" é o mesmo WC de suíte que os outros serviços chamam de WCS
      WHEN lower(r.local_raw) = 'wcs'              THEN 'WCS'
      WHEN lower(r.local_raw) = 'wc'               THEN 'WC'
      WHEN lower(r.local_raw) = 'suite'            THEN 'Suíte'
      ELSE r.local_raw
    END AS local,
    MIN(r.dia) FILTER (WHERE r.concluido)  AS concluido_em,
    MIN(r.dia)                             AS visto_desde,
    BOOL_OR(r.nao_conforme)                AS teve_nao_conformidade
  FROM (
    SELECT
      n.frente, n.checklist, n.org_id, n.dia, n.item, n.concluido, n.nao_conforme,
      btrim(split_part(n.item, ':', 1)) AS servico_raw,
      NULLIF(btrim(substring(n.item FROM position(':' IN n.item) + 1)), '') AS local_raw
    FROM (
      SELECT
        v.frente, v.checklist, v.org_id, v.dia,
        -- chave do item: o título normalizado. Alguns vieram gravados com
        -- espaço duplo ("Forro gesso:  WC"); `regexp_replace` os reúne.
        btrim(regexp_replace(i.title, '\s+', ' ', 'g')) AS item,
        COALESCE(s.semantic = 'positivo', FALSE) AS concluido,
        COALESCE(s.semantic = 'negativo', FALSE) AS nao_conforme
      FROM vw_obra_vistoria v
      JOIN application_items i ON i.application_id = v.application_id
      LEFT JOIN vw_obra_semantic s
             ON s.checklist_id = v.checklist_id AND s.label = i.answer
    ) n
  ) r
  GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT servico,
       local,
       count(*)                                                      AS previsto,
       count(*) FILTER (WHERE concluido_em IS NOT NULL)              AS feitos,
       count(*) FILTER (WHERE concluido_em IS NULL)                  AS falta,
       ROUND(100.0 * count(*) FILTER (WHERE concluido_em IS NOT NULL)
             / count(*), 1)                                          AS pct_concluido
FROM vw_obra_item
WHERE 1 = 1
  [[AND frente = {{frente}}]]
GROUP BY servico, local
ORDER BY falta DESC, servico, local;

-- @card 11.10 — Onde falta: quais apartamentos
--   "Soleira · WC: falta em 54 — APT-11, APT-12, …". A coluna `onde` é a
--   que vira ordem de serviço. Substitui os cards 10.19/10.20/10.21.
--   `string_agg(DISTINCT ...)` só aceita ORDER BY pela própria expressão
--   agregada, então a ordem natural exige separar o DISTINCT da contagem.
WITH vw_obra_semantic AS (
  SELECT c.id             AS checklist_id,
         opt->>'label'    AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_obra_vistoria AS (
  SELECT a.id          AS application_id,
         a.org_id,
         a.checklist_id,
         c.title       AS checklist,
         a.date::date  AS dia,
         COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
                   FROM unnest(a.tags_ids) AS tid
                   LEFT JOIN tags t ON t.id = tid),
                  '(sem tag)') AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_obra_item AS (
  SELECT
    r.frente,
    r.checklist,
    r.org_id,
    r.item,
    CASE WHEN r.servico_raw = 'Gas' THEN 'Gás' ELSE r.servico_raw END AS servico,
    CASE
      -- serviços que valem pelo apartamento inteiro, não por cômodo
      WHEN r.servico_raw IN ('Gas', 'Lixa parede') THEN 'Apartamento (todo)'
      -- "Parede Lavanderia: Tipo 3, 6" — o sufixo é tipologia, o local é a lavanderia
      WHEN r.servico_raw = 'Parede Lavanderia'     THEN 'Lavanderia'
      -- "Soleira: WCs" é o mesmo WC de suíte que os outros serviços chamam de WCS
      WHEN lower(r.local_raw) = 'wcs'              THEN 'WCS'
      WHEN lower(r.local_raw) = 'wc'               THEN 'WC'
      WHEN lower(r.local_raw) = 'suite'            THEN 'Suíte'
      ELSE r.local_raw
    END AS local,
    MIN(r.dia) FILTER (WHERE r.concluido)  AS concluido_em,
    MIN(r.dia)                             AS visto_desde,
    BOOL_OR(r.nao_conforme)                AS teve_nao_conformidade
  FROM (
    SELECT
      n.frente, n.checklist, n.org_id, n.dia, n.item, n.concluido, n.nao_conforme,
      btrim(split_part(n.item, ':', 1)) AS servico_raw,
      NULLIF(btrim(substring(n.item FROM position(':' IN n.item) + 1)), '') AS local_raw
    FROM (
      SELECT
        v.frente, v.checklist, v.org_id, v.dia,
        -- chave do item: o título normalizado. Alguns vieram gravados com
        -- espaço duplo ("Forro gesso:  WC"); `regexp_replace` os reúne.
        btrim(regexp_replace(i.title, '\s+', ' ', 'g')) AS item,
        COALESCE(s.semantic = 'positivo', FALSE) AS concluido,
        COALESCE(s.semantic = 'negativo', FALSE) AS nao_conforme
      FROM vw_obra_vistoria v
      JOIN application_items i ON i.application_id = v.application_id
      LEFT JOIN vw_obra_semantic s
             ON s.checklist_id = v.checklist_id AND s.label = i.answer
    ) n
  ) r
  GROUP BY 1, 2, 3, 4, 5, 6
),
pend AS (
  SELECT DISTINCT servico, local, frente,
         NULLIF(regexp_replace(frente, '\D', '', 'g'), '')::bigint AS ord
  FROM vw_obra_item
  WHERE concluido_em IS NULL
    [[AND servico = {{servico}}]]
    [[AND local = {{local}}]]
),
cnt AS (
  SELECT servico, local, count(DISTINCT frente) AS frentes, count(*) AS falta
  FROM vw_obra_item
  WHERE concluido_em IS NULL
    [[AND servico = {{servico}}]]
    [[AND local = {{local}}]]
  GROUP BY servico, local
)
SELECT c.servico,
       c.local,
       c.frentes AS qtd_apartamentos,
       c.falta   AS itens_pendentes,
       string_agg(p.frente, ', ' ORDER BY p.ord NULLS LAST, p.frente) AS onde
FROM cnt c
JOIN pend p ON p.servico = c.servico AND p.local = c.local
GROUP BY c.servico, c.local, c.frentes, c.falta
ORDER BY c.falta DESC, c.servico, c.local;

-- @card 11.11 — Onde foi feito: quais apartamentos
--   O espelho do 11.10, e a pergunta da premissa que o dashboard 10 não
--   respondia em card nenhum. Inclui QUANDO fechou cada lugar.
WITH vw_obra_semantic AS (
  SELECT c.id             AS checklist_id,
         opt->>'label'    AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_obra_vistoria AS (
  SELECT a.id          AS application_id,
         a.org_id,
         a.checklist_id,
         c.title       AS checklist,
         a.date::date  AS dia,
         COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
                   FROM unnest(a.tags_ids) AS tid
                   LEFT JOIN tags t ON t.id = tid),
                  '(sem tag)') AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_obra_item AS (
  SELECT
    r.frente,
    r.checklist,
    r.org_id,
    r.item,
    CASE WHEN r.servico_raw = 'Gas' THEN 'Gás' ELSE r.servico_raw END AS servico,
    CASE
      -- serviços que valem pelo apartamento inteiro, não por cômodo
      WHEN r.servico_raw IN ('Gas', 'Lixa parede') THEN 'Apartamento (todo)'
      -- "Parede Lavanderia: Tipo 3, 6" — o sufixo é tipologia, o local é a lavanderia
      WHEN r.servico_raw = 'Parede Lavanderia'     THEN 'Lavanderia'
      -- "Soleira: WCs" é o mesmo WC de suíte que os outros serviços chamam de WCS
      WHEN lower(r.local_raw) = 'wcs'              THEN 'WCS'
      WHEN lower(r.local_raw) = 'wc'               THEN 'WC'
      WHEN lower(r.local_raw) = 'suite'            THEN 'Suíte'
      ELSE r.local_raw
    END AS local,
    MIN(r.dia) FILTER (WHERE r.concluido)  AS concluido_em,
    MIN(r.dia)                             AS visto_desde,
    BOOL_OR(r.nao_conforme)                AS teve_nao_conformidade
  FROM (
    SELECT
      n.frente, n.checklist, n.org_id, n.dia, n.item, n.concluido, n.nao_conforme,
      btrim(split_part(n.item, ':', 1)) AS servico_raw,
      NULLIF(btrim(substring(n.item FROM position(':' IN n.item) + 1)), '') AS local_raw
    FROM (
      SELECT
        v.frente, v.checklist, v.org_id, v.dia,
        -- chave do item: o título normalizado. Alguns vieram gravados com
        -- espaço duplo ("Forro gesso:  WC"); `regexp_replace` os reúne.
        btrim(regexp_replace(i.title, '\s+', ' ', 'g')) AS item,
        COALESCE(s.semantic = 'positivo', FALSE) AS concluido,
        COALESCE(s.semantic = 'negativo', FALSE) AS nao_conforme
      FROM vw_obra_vistoria v
      JOIN application_items i ON i.application_id = v.application_id
      LEFT JOIN vw_obra_semantic s
             ON s.checklist_id = v.checklist_id AND s.label = i.answer
    ) n
  ) r
  GROUP BY 1, 2, 3, 4, 5, 6
),
feito AS (
  SELECT DISTINCT servico, local, frente,
         NULLIF(regexp_replace(frente, '\D', '', 'g'), '')::bigint AS ord
  FROM vw_obra_item
  WHERE concluido_em IS NOT NULL
    [[AND servico = {{servico}}]]
    [[AND local = {{local}}]]
),
cnt AS (
  SELECT servico, local,
         count(DISTINCT frente) AS frentes,
         count(*)               AS feitos,
         MIN(concluido_em)      AS primeiro,
         MAX(concluido_em)      AS ultimo
  FROM vw_obra_item
  WHERE concluido_em IS NOT NULL
    [[AND servico = {{servico}}]]
    [[AND local = {{local}}]]
  GROUP BY servico, local
)
SELECT c.servico,
       c.local,
       c.frentes  AS qtd_apartamentos,
       c.feitos   AS itens_concluidos,
       c.primeiro AS primeiro_avanco,
       c.ultimo   AS ultimo_avanco,
       string_agg(f.frente, ', ' ORDER BY f.ord NULLS LAST, f.frente) AS onde
FROM cnt c
JOIN feito f ON f.servico = c.servico AND f.local = c.local
GROUP BY c.servico, c.local, c.frentes, c.feitos, c.primeiro, c.ultimo
ORDER BY c.feitos DESC, c.servico, c.local;

-- @card 11.12 — A lista nominal de pendências
--   Uma linha por serviço pendente num lugar específico. É o que se leva
--   para o campo. Sem filtro de frente combinado com serviço por default,
--   então abre com a obra inteira: 1036 linhas.
WITH vw_obra_semantic AS (
  SELECT c.id             AS checklist_id,
         opt->>'label'    AS label,
         opt->>'semantic' AS semantic
  FROM checklists c,
       LATERAL jsonb_array_elements(c.options) AS opt
),
vw_obra_vistoria AS (
  SELECT a.id          AS application_id,
         a.org_id,
         a.checklist_id,
         c.title       AS checklist,
         a.date::date  AS dia,
         COALESCE((SELECT string_agg(COALESCE(t.label, '(tag removida)'), ' · ' ORDER BY t.label)
                   FROM unnest(a.tags_ids) AS tid
                   LEFT JOIN tags t ON t.id = tid),
                  '(sem tag)') AS frente
  FROM applications a
  JOIN checklists c ON c.id = a.checklist_id
),
vw_obra_item AS (
  SELECT
    r.frente,
    r.checklist,
    r.org_id,
    r.item,
    CASE WHEN r.servico_raw = 'Gas' THEN 'Gás' ELSE r.servico_raw END AS servico,
    CASE
      -- serviços que valem pelo apartamento inteiro, não por cômodo
      WHEN r.servico_raw IN ('Gas', 'Lixa parede') THEN 'Apartamento (todo)'
      -- "Parede Lavanderia: Tipo 3, 6" — o sufixo é tipologia, o local é a lavanderia
      WHEN r.servico_raw = 'Parede Lavanderia'     THEN 'Lavanderia'
      -- "Soleira: WCs" é o mesmo WC de suíte que os outros serviços chamam de WCS
      WHEN lower(r.local_raw) = 'wcs'              THEN 'WCS'
      WHEN lower(r.local_raw) = 'wc'               THEN 'WC'
      WHEN lower(r.local_raw) = 'suite'            THEN 'Suíte'
      ELSE r.local_raw
    END AS local,
    MIN(r.dia) FILTER (WHERE r.concluido)  AS concluido_em,
    MIN(r.dia)                             AS visto_desde,
    BOOL_OR(r.nao_conforme)                AS teve_nao_conformidade
  FROM (
    SELECT
      n.frente, n.checklist, n.org_id, n.dia, n.item, n.concluido, n.nao_conforme,
      btrim(split_part(n.item, ':', 1)) AS servico_raw,
      NULLIF(btrim(substring(n.item FROM position(':' IN n.item) + 1)), '') AS local_raw
    FROM (
      SELECT
        v.frente, v.checklist, v.org_id, v.dia,
        -- chave do item: o título normalizado. Alguns vieram gravados com
        -- espaço duplo ("Forro gesso:  WC"); `regexp_replace` os reúne.
        btrim(regexp_replace(i.title, '\s+', ' ', 'g')) AS item,
        COALESCE(s.semantic = 'positivo', FALSE) AS concluido,
        COALESCE(s.semantic = 'negativo', FALSE) AS nao_conforme
      FROM vw_obra_vistoria v
      JOIN application_items i ON i.application_id = v.application_id
      LEFT JOIN vw_obra_semantic s
             ON s.checklist_id = v.checklist_id AND s.label = i.answer
    ) n
  ) r
  GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT frente        AS apartamento,
       servico,
       local,
       item,
       visto_desde   AS visto_pendente_desde,
       teve_nao_conformidade AS reprovado_em_alguma_vistoria
FROM vw_obra_item
WHERE concluido_em IS NULL
  [[AND frente = {{frente}}]]
  [[AND servico = {{servico}}]]
  [[AND local = {{local}}]]
ORDER BY servico, local,
         NULLIF(regexp_replace(frente, '\D', '', 'g'), '')::bigint NULLS LAST,
         frente;
