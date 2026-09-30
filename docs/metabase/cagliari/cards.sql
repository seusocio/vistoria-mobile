-- =====================================================================
-- ANDAMENTO CAGLIARI — os cards
--
-- Cada card tem um front-matter (`-- chave: valor`) que o `build.py` e o
-- `provision.ts` lêem. Nada de mapa de visualização escondido no script:
-- o card declara o que ele é, ao lado do SQL que ele roda.
--
--   @card <id>     identificador estável; é por ele que o provision casa
--                  o card existente no Metabase e atualiza em vez de duplicar
--   titulo:        o nome que aparece no Metabase
--   secao:         agrupa os cards sob um cabeçalho no dashboard
--   viz:           table | pie | line | row | bar | pivot
--   size:          largura x altura na grade de 24 colunas
--   pergunta:      a pergunta que o card responde, em uma linha
--   filtros:       quais filtros o `/*@filtros*/` expande (veja build.py)
--
-- `/*@filtros*/` é o contrato de filtro, definido UMA vez no build.py e
-- expandido aqui. Um card que agrupa por serviço declara
-- `filtros: padrao -servico`, senão o gráfico vira uma barra só.
-- =====================================================================

-- @card placar
-- titulo: Placar da obra
-- secao: Retrato
-- viz: table
-- size: 24x3
-- pergunta: Quanto está pronto, quanto falta, em que ritmo e quanto falta para fechar.
-- filtros: padrao
SELECT
  count(*)                                                          AS previsto,
  count(*) FILTER (WHERE concluido_em IS NOT NULL)                  AS feitos,
  count(*) FILTER (WHERE concluido_em IS NULL)                      AS falta,
  ROUND(100.0 * count(*) FILTER (WHERE concluido_em IS NOT NULL)
        / NULLIF(count(*), 0), 1)                                   AS pct_concluido,
  ROUND(100.0 * count(*) FILTER (WHERE concluido_em IS NULL)
        / NULLIF(count(*), 0), 1)                                   AS pct_restante,
  count(*) FILTER (WHERE concluido_em >= {{data_a}}
                     AND concluido_em <= {{data_b}})                AS avanco_no_periodo,
  -- ritmo do período e quanto ele levaria para fechar o que falta.
  -- É projeção linear burra, de propósito: serve para ordem de grandeza,
  -- não para cronograma.
  ROUND(count(*) FILTER (WHERE concluido_em >= {{data_a}}
                           AND concluido_em <= {{data_b}})::numeric
        / NULLIF(({{data_b}}::date - {{data_a}}::date) + 1, 0), 1)  AS itens_por_dia,
  CEIL(count(*) FILTER (WHERE concluido_em IS NULL)
       / NULLIF(count(*) FILTER (WHERE concluido_em >= {{data_a}}
                                   AND concluido_em <= {{data_b}})::numeric
                / NULLIF(({{data_b}}::date - {{data_a}}::date) + 1, 0), 0))
                                                                    AS dias_no_ritmo_atual,
  count(DISTINCT apartamento)                                       AS apartamentos,
  count(DISTINCT apartamento) FILTER (WHERE concluido_em IS NULL)   AS aptos_com_pendencia,
  MAX(concluido_em)                                                 AS ultimo_avanco
FROM cag_item
WHERE 1 = 1
  /*@filtros*/;

-- @card pizza
-- titulo: Quanto da obra está pronto
-- secao: Retrato
-- viz: pie
-- size: 8x6
-- pergunta: A divisão do escopo em já pronto, feito no período e falta.
-- filtros: padrao
SELECT faixa, itens FROM (
  SELECT '1 · Já estava pronto' AS faixa, count(*) AS itens, 1 AS ord
    FROM cag_item WHERE concluido_em < {{data_a}} /*@filtros*/
  UNION ALL
  SELECT '2 · Feito no período', count(*), 2
    FROM cag_item WHERE concluido_em >= {{data_a}} AND concluido_em <= {{data_b}} /*@filtros*/
  UNION ALL
  SELECT '3 · Falta', count(*), 3
    FROM cag_item WHERE (concluido_em IS NULL OR concluido_em > {{data_b}}) /*@filtros*/
) p ORDER BY ord;

-- @card curva
-- titulo: Curva de avanço
-- secao: Retrato
-- viz: line
-- size: 16x6
-- pergunta: Em que data a obra andou, e quanto estava pronto em cada data.
-- filtros: padrao
SELECT d.dia,
       (SELECT count(*) FROM cag_item i
         WHERE i.concluido_em = d.dia /*@filtros i*/)               AS avanco_no_dia,
       (SELECT count(*) FROM cag_item i
         WHERE i.concluido_em <= d.dia /*@filtros i*/)              AS pronto_ate_a_data,
       ROUND(100.0 * (SELECT count(*) FROM cag_item i
                       WHERE i.concluido_em <= d.dia /*@filtros i*/)
             / NULLIF((SELECT count(*) FROM cag_item i
                        WHERE 1 = 1 /*@filtros i*/), 0), 1)         AS pct_concluido
FROM (SELECT DISTINCT dia FROM cag_vistoria) d
ORDER BY d.dia;

-- ---------------------------------------------------------------------
-- A GEOMETRIA DO PRÉDIO
--
-- Pavimento e prumada saem da numeração do apartamento (APT-<pav><prum>).
-- É o recorte que o dashboard anterior não tinha e que muda a leitura:
-- obra se planeja por pavimento, e shaft/hidráulica se lêem por prumada.
-- ---------------------------------------------------------------------

-- @card pavimento
-- titulo: Por pavimento
-- secao: A geometria do prédio
-- viz: row
-- size: 12x7
-- pergunta: Em que pavimento a obra está adiantada e em qual está parada.
-- filtros: padrao -pavimentos
SELECT 'Pav. ' || lpad(pavimento::text, 2, '0')                     AS pavimento,
       count(*) FILTER (WHERE concluido_em < {{data_a}})            AS "1 · já estava pronto",
       count(*) FILTER (WHERE concluido_em >= {{data_a}}
                          AND concluido_em <= {{data_b}})           AS "2 · feito no período",
       count(*) FILTER (WHERE concluido_em IS NULL
                          OR concluido_em > {{data_b}})             AS "3 · falta"
FROM cag_item
WHERE pavimento IS NOT NULL
  /*@filtros*/
GROUP BY pavimento
ORDER BY pavimento DESC;

-- @card prumada
-- titulo: Por prumada
-- secao: A geometria do prédio
-- viz: row
-- size: 12x7
-- pergunta: Alguma coluna vertical do prédio ficou para trás?
-- filtros: padrao -prumadas
SELECT 'Prumada ' || prumada::text                                  AS prumada,
       count(*) FILTER (WHERE concluido_em < {{data_a}})            AS "1 · já estava pronto",
       count(*) FILTER (WHERE concluido_em >= {{data_a}}
                          AND concluido_em <= {{data_b}})           AS "2 · feito no período",
       count(*) FILTER (WHERE concluido_em IS NULL
                          OR concluido_em > {{data_b}})             AS "3 · falta"
FROM cag_item
WHERE prumada IS NOT NULL
  /*@filtros*/
GROUP BY prumada
ORDER BY prumada;

-- @card mapa_predio
-- titulo: Mapa do prédio
-- secao: A geometria do prédio
-- viz: heatmap
-- size: 24x8
-- pergunta: O prédio inteiro numa grade: % concluído de cada apartamento.
-- filtros: padrao -pavimentos -prumadas
--   ATENÇÃO: o Metabase NÃO faz pivot em pergunta nativa — a UI responde
--   "Pivot tables are only supported for questions built in the query
--   builder". Então a transposição é feita aqui no SQL, e o card sobe como
--   tabela com escala de cor (`viz: heatmap`, veja o provision.ts).
--
--   As seis prumadas são fixas: a numeração é APT-<pavimento><prumada> e o
--   prédio tem seis por andar. `Outras` existe para que um apartamento com
--   numeração fora do padrão apareça, em vez de sumir da grade calado.
SELECT 'Pav. ' || lpad(pavimento::text, 2, '0')                           AS pavimento,
       ROUND(100.0 * count(*) FILTER (WHERE prumada = 1 AND concluido_em IS NOT NULL)
             / NULLIF(count(*) FILTER (WHERE prumada = 1), 0))            AS "Prumada 1",
       ROUND(100.0 * count(*) FILTER (WHERE prumada = 2 AND concluido_em IS NOT NULL)
             / NULLIF(count(*) FILTER (WHERE prumada = 2), 0))            AS "Prumada 2",
       ROUND(100.0 * count(*) FILTER (WHERE prumada = 3 AND concluido_em IS NOT NULL)
             / NULLIF(count(*) FILTER (WHERE prumada = 3), 0))            AS "Prumada 3",
       ROUND(100.0 * count(*) FILTER (WHERE prumada = 4 AND concluido_em IS NOT NULL)
             / NULLIF(count(*) FILTER (WHERE prumada = 4), 0))            AS "Prumada 4",
       ROUND(100.0 * count(*) FILTER (WHERE prumada = 5 AND concluido_em IS NOT NULL)
             / NULLIF(count(*) FILTER (WHERE prumada = 5), 0))            AS "Prumada 5",
       ROUND(100.0 * count(*) FILTER (WHERE prumada = 6 AND concluido_em IS NOT NULL)
             / NULLIF(count(*) FILTER (WHERE prumada = 6), 0))            AS "Prumada 6",
       ROUND(100.0 * count(*) FILTER (WHERE prumada NOT BETWEEN 1 AND 6
                                        AND concluido_em IS NOT NULL)
             / NULLIF(count(*) FILTER (WHERE prumada NOT BETWEEN 1 AND 6), 0)) AS "Outras",
       ROUND(100.0 * count(*) FILTER (WHERE concluido_em IS NOT NULL)
             / count(*))                                                  AS "Pavimento %"
FROM cag_item
WHERE pavimento IS NOT NULL
  /*@filtros*/
GROUP BY pavimento
ORDER BY pavimento DESC;

-- ---------------------------------------------------------------------
-- O QUE FALTA
--
-- Os eixos de escopo, todos com as mesmas colunas. Somar `previsto` em
-- qualquer um deles dá o mesmo total — é isso que torna os cards
-- comparáveis entre si.
-- ---------------------------------------------------------------------

-- @card servico
-- titulo: Por serviço
-- secao: O que falta
-- viz: row
-- size: 12x7
-- pergunta: Qual serviço está mais atrasado.
-- filtros: padrao -servicos
SELECT servico,
       count(*) FILTER (WHERE concluido_em < {{data_a}})            AS "1 · já estava pronto",
       count(*) FILTER (WHERE concluido_em >= {{data_a}}
                          AND concluido_em <= {{data_b}})           AS "2 · feito no período",
       count(*) FILTER (WHERE concluido_em IS NULL
                          OR concluido_em > {{data_b}})             AS "3 · falta"
FROM cag_item
WHERE 1 = 1
  /*@filtros*/
GROUP BY servico
ORDER BY "3 · falta" DESC, servico;

-- @card local
-- titulo: Por local
-- secao: O que falta
-- viz: row
-- size: 12x7
-- pergunta: Qual cômodo concentra a pendência.
-- filtros: padrao -locais
SELECT local,
       count(*) FILTER (WHERE concluido_em < {{data_a}})            AS "1 · já estava pronto",
       count(*) FILTER (WHERE concluido_em >= {{data_a}}
                          AND concluido_em <= {{data_b}})           AS "2 · feito no período",
       count(*) FILTER (WHERE concluido_em IS NULL
                          OR concluido_em > {{data_b}})             AS "3 · falta"
FROM cag_item
WHERE 1 = 1
  /*@filtros*/
GROUP BY local
ORDER BY "3 · falta" DESC, local;

-- @card item
-- titulo: Por item do checklist
-- secao: O que falta
-- viz: table
-- size: 24x8
-- pergunta: Os 30 itens do checklist, um a um, com serviço e local separados.
-- filtros: padrao
SELECT item,
       servico,
       local,
       count(*)                                                     AS previsto,
       count(*) FILTER (WHERE concluido_em < {{data_a}})            AS ja_estava_pronto,
       count(*) FILTER (WHERE concluido_em >= {{data_a}}
                          AND concluido_em <= {{data_b}})           AS feito_no_periodo,
       count(*) FILTER (WHERE concluido_em IS NULL
                          OR concluido_em > {{data_b}})             AS falta,
       ROUND(100.0 * count(*) FILTER (WHERE concluido_em IS NOT NULL)
             / count(*), 1)                                         AS pct_concluido,
       MAX(concluido_em)                                            AS ultimo_avanco
FROM cag_item
WHERE 1 = 1
  /*@filtros*/
GROUP BY item, servico, local
ORDER BY falta DESC, servico, local;

-- @card mapa_servico_local
-- titulo: Mapa serviço × local
-- secao: O que falta
-- viz: heatmap_falta
-- size: 24x8
-- pergunta: Onde estão os buracos, cruzando serviço com cômodo — a célula é quanto falta.
-- filtros: padrao -locais
--   Transposto no SQL pelo mesmo motivo do Mapa do prédio: o Metabase não
--   faz pivot em pergunta nativa.
--
--   Os nove locais são os que o `CASE` de `cag_item` produz — um conjunto
--   fechado, definido pelo modelo. `Outros` existe para que um local novo
--   apareça em vez de sumir da tabela em silêncio: se ele aparecer com
--   número, é sinal de que o checklist mudou e esta lista precisa de mais
--   uma coluna.
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
  /*@filtros*/
GROUP BY servico
ORDER BY "Total falta" DESC, servico;

-- ---------------------------------------------------------------------
-- QUANDO
-- ---------------------------------------------------------------------

-- @card avanco_por_dia
-- titulo: O que avançou em cada data
-- secao: Quando
-- viz: table
-- size: 12x7
-- pergunta: Em 24/09 andou o quê, em quantos apartamentos, e quais.
-- filtros: padrao
SELECT c.dia,
       c.servico,
       c.itens,
       c.apartamentos,
       c.locais,
       a.onde
FROM (
  SELECT concluido_em AS dia, servico,
         count(*)                    AS itens,
         count(DISTINCT apartamento) AS apartamentos,
         string_agg(DISTINCT local, ', ' ORDER BY local) AS locais
  FROM cag_item
  WHERE concluido_em IS NOT NULL
    /*@filtros*/
  GROUP BY 1, 2
) c
JOIN (
  SELECT dia, servico,
         string_agg(apartamento, ', ' ORDER BY ord NULLS LAST, apartamento) AS onde
  FROM (
    SELECT DISTINCT concluido_em AS dia, servico, apartamento,
           NULLIF(regexp_replace(apartamento, '\D', '', 'g'), '')::int AS ord
    FROM cag_item
    WHERE concluido_em IS NOT NULL AND apartamento IS NOT NULL
      /*@filtros*/
  ) d GROUP BY dia, servico
) a ON a.dia = c.dia AND a.servico = c.servico
ORDER BY c.dia DESC, c.itens DESC;

-- @card paradas
-- titulo: Frentes paradas
-- secao: Quando
-- viz: table
-- size: 12x7
-- pergunta: Que apartamentos não avançam há mais tempo, e quanto ainda devem.
--   `dias_sem_avanco` conta da última vez que QUALQUER item daquele
--   apartamento ficou pronto até a última vistoria registrada na obra.
--   Nunca avançou = nunca teve item concluído.
-- filtros: padrao
SELECT i.apartamento,
       i.pavimento,
       i.prumada,
       count(*)                                          AS previsto,
       count(*) FILTER (WHERE i.concluido_em IS NULL)    AS falta,
       ROUND(100.0 * count(*) FILTER (WHERE i.concluido_em IS NOT NULL)
             / count(*), 1)                              AS pct_concluido,
       MAX(i.concluido_em)                               AS ultimo_avanco,
       (SELECT MAX(dia) FROM cag_vistoria) - MAX(i.concluido_em) AS dias_sem_avanco,
       MAX(i.visto_ate)                                  AS ultima_vistoria
FROM cag_item i
WHERE i.apartamento IS NOT NULL
  /*@filtros i*/
GROUP BY i.apartamento, i.pavimento, i.prumada
--   O desempate por apartamento não é enfeite: sem ele, dezenas de linhas
--   empatam em `dias_sem_avanco` e `falta`, e a tabela sai numa ordem
--   diferente a cada execução.
ORDER BY dias_sem_avanco DESC NULLS FIRST,
         falta DESC,
         NULLIF(regexp_replace(i.apartamento, '\D', '', 'g'), '')::int NULLS LAST,
         i.apartamento;

-- ---------------------------------------------------------------------
-- ONDE IR
-- ---------------------------------------------------------------------

-- @card onde_falta
-- titulo: Onde falta
-- secao: Onde ir
-- viz: table
-- size: 12x7
-- pergunta: Para cada serviço e cômodo, em quais apartamentos ainda falta.
--   A coluna `onde` é a que vira ordem de serviço. `string_agg(DISTINCT)`
--   só aceita ORDER BY pela própria expressão agregada, por isso o
--   DISTINCT sai numa subquery separada da contagem — é o que permite a
--   ordem natural (APT-9 antes de APT-11, não depois).
-- filtros: padrao
SELECT c.servico, c.local, c.apartamentos, c.falta, d.onde
FROM (
  SELECT servico, local,
         count(DISTINCT apartamento) AS apartamentos,
         count(*)                    AS falta
  FROM cag_item
  WHERE concluido_em IS NULL
    /*@filtros*/
  GROUP BY 1, 2
) c
JOIN (
  SELECT servico, local,
         string_agg(apartamento, ', ' ORDER BY ord NULLS LAST, apartamento) AS onde
  FROM (
    SELECT DISTINCT servico, local, apartamento,
           NULLIF(regexp_replace(apartamento, '\D', '', 'g'), '')::int AS ord
    FROM cag_item
    WHERE concluido_em IS NULL AND apartamento IS NOT NULL
      /*@filtros*/
  ) x GROUP BY servico, local
) d ON d.servico = c.servico AND d.local = c.local
ORDER BY c.falta DESC, c.servico, c.local;

-- @card onde_foi_feito
-- titulo: Onde foi feito
-- secao: Onde ir
-- viz: table
-- size: 12x7
-- pergunta: O espelho do anterior — onde já está pronto, e desde quando.
-- filtros: padrao
SELECT c.servico, c.local, c.apartamentos, c.feitos,
       c.primeiro_avanco, c.ultimo_avanco, d.onde
FROM (
  SELECT servico, local,
         count(DISTINCT apartamento) AS apartamentos,
         count(*)                    AS feitos,
         MIN(concluido_em)           AS primeiro_avanco,
         MAX(concluido_em)           AS ultimo_avanco
  FROM cag_item
  WHERE concluido_em IS NOT NULL
    /*@filtros*/
  GROUP BY 1, 2
) c
JOIN (
  SELECT servico, local,
         string_agg(apartamento, ', ' ORDER BY ord NULLS LAST, apartamento) AS onde
  FROM (
    SELECT DISTINCT servico, local, apartamento,
           NULLIF(regexp_replace(apartamento, '\D', '', 'g'), '')::int AS ord
    FROM cag_item
    WHERE concluido_em IS NOT NULL AND apartamento IS NOT NULL
      /*@filtros*/
  ) x GROUP BY servico, local
) d ON d.servico = c.servico AND d.local = c.local
ORDER BY c.feitos DESC, c.servico, c.local;

-- @card lista
-- titulo: Lista de pendências
-- secao: Onde ir
-- viz: table
-- size: 24x8
-- pergunta: Uma linha por serviço pendente num lugar específico. É o que se leva a campo.
-- filtros: padrao
SELECT apartamento,
       pavimento,
       prumada,
       servico,
       local,
       item,
       visto_desde                                      AS pendente_desde,
       vistorias                                        AS vezes_vistoriado,
       teve_nao_conformidade                            AS ja_reprovado
FROM cag_item
WHERE concluido_em IS NULL
  /*@filtros*/
ORDER BY servico, local,
         NULLIF(regexp_replace(apartamento, '\D', '', 'g'), '')::int NULLS LAST,
         apartamento;
