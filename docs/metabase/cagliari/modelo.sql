-- =====================================================================
-- ANDAMENTO CAGLIARI — o modelo
--
-- Fonte única da verdade. Os cards em `cards.sql` não repetem regra de
-- negócio nenhuma: só agregam o que sai daqui.
--
-- Três regras, e todo o resto decorre delas:
--
--   1. FRENTE = checklist + conjunto de tags. A tag sozinha não
--      identifica: a mesma tag pode pertencer a checklists diferentes,
--      com escopos diferentes. O checklist entra pelo ID (estável); as
--      tags entram pelo RÓTULO (é o que uma pessoa digita num filtro).
--
--   2. O PROGRESSO É CUMULATIVO. Um item concluído continua concluído nas
--      vistorias seguintes. O que importa por item é `concluido_em` — a
--      PRIMEIRA vistoria em que ele apareceu concluído. NULL = nunca foi.
--
--   3. A DATA É `applications.date`, NUNCA `answered_at`. No banco o
--      `answered_at` guarda quando a linha foi gravada, não quando o
--      serviço foi feito: itens da vistoria de 16/09 têm `answered_at` do
--      dia da carga. Datar por ele achata o histórico num dia só.
--
-- Concluído = resposta com `semantic = 'positivo'`, que vem das `options`
-- do próprio checklist. "Não" e "Parcial" são respondidos, não concluídos.
-- =====================================================================

DROP VIEW IF EXISTS cag_item CASCADE;
DROP VIEW IF EXISTS cag_vistoria CASCADE;
DROP VIEW IF EXISTS cag_semantic CASCADE;

-- Rótulo da resposta -> semantic, por checklist.
CREATE VIEW cag_semantic AS
SELECT c.id             AS checklist_id,
       opt->>'label'    AS label,
       opt->>'semantic' AS semantic
FROM checklists c,
     LATERAL jsonb_array_elements(c.options) AS opt;

-- Cada vistoria com a frente resolvida e a geometria do prédio decodificada.
--
-- A numeração do CAGLIARI é posicional: APT-<pavimento><prumada>, com a
-- prumada sempre no último dígito. APT-11 = pavimento 1, prumada 1;
-- APT-106 = pavimento 10, prumada 6. São 10 × 6 = 60 apartamentos.
-- Pavimento e prumada saem daí e viram filtro: obra sobe pavimento a
-- pavimento, e shaft/hidráulica se lêem por prumada.
CREATE VIEW cag_vistoria AS
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
) tg ON TRUE;

-- A DIMENSÃO: uma linha por frente (checklist + conjunto de tags), com
-- todos os atributos já resolvidos. São 60 linhas.
--
-- Existe para tirar peso do GROUP BY do fato. Agregar já carregando
-- `tags_arr` (array), `tags` e `frente` (strings longas) obriga o Postgres
-- a ordenar 6.586 linhas por 14 colunas; agregando só pela chave mínima e
-- juntando a dimensão depois, o mesmo resultado sai 3,5x mais rápido.
CREATE VIEW cag_frente AS
SELECT DISTINCT
       checklist_id, checklist, projeto, project_id, org_id,
       tags, tags_arr, apartamento, pavimento, prumada,
       checklist || ' · ' || COALESCE(tags, '(sem tag)') AS frente
FROM cag_vistoria;

-- O FATO: um item por frente (não por vistoria), com a data em que ficou
-- pronto e todas as dimensões já resolvidas. Todo card do dashboard sai
-- desta view e só dela.
--
-- SERVIÇO E LOCAL. Os títulos são `Base shaft: WC` — serviço antes do
-- `:`, local depois. O `split_part` cru acerta 26 dos 30 itens e erra 4,
-- e os 4 vazam para todo card de serviço. As exceções estão tratadas no
-- CASE abaixo, nomeadas uma a uma, e o resultado é: os 30 itens caem num
-- par (serviço, local) válido, zero órfãos.
--
-- CHAVE DO ITEM: o TÍTULO normalizado, não o `checklist_item_id`. O
-- checklist foi reeditado em algum momento e existem duas famílias de id
-- para o mesmo bloco de Contramarco (`citem_muey5bdl*`, `citem_mucmjxs4*`);
-- as vistorias de 24/09 carregam as duas. Chavear por id conta o mesmo
-- serviço duas vezes e infla o progresso da obra.
--
-- Alguns títulos vieram gravados com espaço duplo ("Forro gesso:  WC").
-- Normalizar o branco é o que os reúne num item só.
CREATE VIEW cag_item AS
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
) sl;
