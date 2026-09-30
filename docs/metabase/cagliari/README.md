# Andamento CAGLIARI

Dashboard de levantamento de obra do projeto **CAGLIARI**, no Metabase.

[**meta.seusoc.io/dashboard/10**](https://meta.seusoc.io/dashboard/10) ·
coleção *Andamento CAGLIARI* (id 6) · banco `vistoria-app` (id 2) ·
15 cards · 8 filtros.

## Como isto está montado

Quatro arquivos, cada um com uma função, e nenhum repete o outro:

```
modelo.sql   as regras de negócio, em 3 views. Fonte única.
cards.sql    os 15 cards. Só agregam o que sai do modelo.
build.py     compila modelo + cards -> standalone/ + manifesto.json
provision.ts sobe standalone/ pro Metabase, lendo o manifesto
```

`standalone/` é **gerado**. Nunca edite lá.

```bash
python3 docs/metabase/cagliari/build.py          # 1. compilar

export MB_URL=https://meta.seusoc.io             # 2. subir
export MB_API_KEY=mb_...                         #    Admin → Settings → Authentication → API keys
bun run docs/metabase/cagliari/provision.ts --database 2
```

`--dry-run` mostra o que subiria sem tocar em nada.
O provision é idempotente: casa o card pelo nome e atualiza, não duplica.

`standalone/` existe porque o editor nativo do Metabase **não roda DDL nem
várias instruções** — colar um `CREATE VIEW` lá dá *"Select statement did not
produce a ResultSet"*. O build embute as views de que cada card depende como
CTE no topo, então cada arquivo de `standalone/` é um `SELECT` só, que se cola
no Metabase e roda.

### O front-matter

Cada card declara o que é, ao lado do SQL que roda — em vez de um mapa de
visualização escondido no script de provisionamento:

```sql
-- @card mapa_predio
-- titulo: Mapa do prédio
-- secao: A geometria do prédio
-- viz: pivot
-- size: 24x8
-- pivot: linhas=pavimento colunas=prumada valores=pct_concluido
-- pergunta: O prédio inteiro numa grade: % concluído de cada apartamento.
-- filtros: padrao -pavimentos -prumadas
```

`build.py` valida o front-matter e falha se faltar campo obrigatório ou se
`filtros:` citar um filtro que não existe.

## O modelo

Três regras, e todo o resto decorre delas:

1. **Frente = checklist + conjunto de tags.** A tag sozinha não identifica: a
   mesma tag pode pertencer a checklists diferentes, com escopos diferentes.
2. **O progresso é cumulativo.** Um item concluído continua concluído nas
   vistorias seguintes. O que importa por item é `concluido_em` — a *primeira*
   vistoria em que apareceu concluído. `NULL` = nunca foi.
3. **A data é `applications.date`, nunca `answered_at`.** O `answered_at`
   guarda quando a linha foi gravada, não quando o serviço foi feito.

Concluído = resposta com `semantic = 'positivo'`, que vem das `options` do
próprio checklist. "Não" e "Parcial" são respondidos, não concluídos.

### A geometria do prédio

A numeração do CAGLIARI é posicional — `APT-<pavimento><prumada>`, prumada no
último dígito. `APT-11` = pavimento 1, prumada 1; `APT-106` = pavimento 10,
prumada 6. São **10 × 6 = 60 apartamentos**, e daí saem dois eixos que o
protótipo anterior não tinha:

- **pavimento** — obra se planeja e se mede pavimento a pavimento;
- **prumada** — shaft, hidráulica e gás se lêem pela coluna vertical.

O card *Mapa do prédio* cruza os dois: lido de cima para baixo, é a fachada.

### Serviço e local

Os títulos dos itens são `Base shaft: WC` — serviço antes do `:`, local depois.
O `split_part` cru acerta 26 dos 30 itens e erra 4, e os 4 vazam para todo card
de serviço. As exceções estão nomeadas uma a uma no `CASE` de `cag_item`:

| item | local com split cru | problema | local no modelo |
|---|---|---|---|
| `Soleira: WCs` | `WCs` | duplica `WCS` | `WCS` |
| `Gas: Chumbar` | `Chumbar` | não é lugar | `Apartamento (todo)` |
| `Parede Lavanderia: Tipo 3, 6` | `Tipo 3, 6` | é tipologia | `Lavanderia` |
| `Lixa parede` | *(sem `:`)* | cai no balde `—` | `Apartamento (todo)` |

Resultado: **10 serviços × 9 locais, zero órfãos**.

### A chave do item

O item é chaveado pelo **título normalizado**, não pelo `checklist_item_id`. O
checklist foi reeditado em algum momento e existem duas famílias de id para o
mesmo bloco de Contramarco (`citem_muey5bdl*` e `citem_mucmjxs4*`); as 34
vistorias de 24/09 carregam as duas. Como o bloco duplicado está todo "Sim",
chavear por id infla o progresso da obra:

| | escopo | concluído |
|---|---|---|
| por `checklist_item_id` | inflado pelo bloco duplicado | superestima |
| por título *(este modelo)* | **1800** = 60 × 30, exato | o real |

O escopo é **1800 = 60 frentes × 30 itens**, e se mantém assim conforme novas
vistorias entram — é o teste mais rápido de que o modelo continua íntegro.

Também normaliza o branco: alguns títulos vieram com espaço duplo
(`Forro gesso:  WC`), e sem isso viram itens separados.

## Os filtros

Definidos **uma vez**, no `FILTROS` do `build.py`, e expandidos em todo card que
escreve `/*@filtros*/`. Um card que agrupa por serviço declara
`filtros: padrao -servicos`, senão o gráfico vira uma barra só.

| Filtro | Aceita | Exemplo |
|---|---|---|
| Início / Fim do período | data | *default vem do banco* |
| Checklist (id) | um id | `seed-checklist-apartamentos` |
| Tags | rótulos, **vírgula** | `APT-11, APT-12, APT-13` |
| Pavimentos | números, **vírgula** | `1,2,10` |
| Prumadas | números, **vírgula** | `1,6` |
| Serviços | nomes, **vírgula** | `Soleira, Base shaft` |
| Locais | nomes, **vírgula** | `WC, WCS` |

**Checklist por ID, tags por rótulo.** O id do checklist é estável e é ele que
identifica a frente; as tags entram pelo rótulo porque é o que uma pessoa
digita. O `btrim` absorve o espaço depois da vírgula. Tags casam por
*interseção* (`&&`): a frente entra se tiver **alguma** das tags listadas.

**Só as datas têm default**, e isso é deliberado. O Metabase marca variável com
default como `required: true`, o que faz o `[[AND ...]]` deixar de ser opcional
— e aí dois filtros apontando para escopos diferentes zeram o card **em
silêncio**, sem erro nenhum. Sem default, o dashboard abre na obra inteira e
todo recorte é escolha explícita de quem está olhando.

## Os 15 cards

**Retrato** — `placar` (escopo, feitos, falta, %, ritmo, dias no ritmo atual) ·
`pizza` · `curva` de avanço acumulado.

**A geometria do prédio** — `pavimento` · `prumada` · `mapa_predio`.

**O que falta** — `servico` · `local` · `item` (os 30, um a um) ·
`mapa_servico_local`.

**Quando** — `avanco_por_dia` (o que andou em cada data e onde) ·
`paradas` (apartamentos que não avançam há mais tempo).

**Onde ir** — `onde_falta` · `onde_foi_feito` · `lista` (1036 linhas, para campo).

As três faixas têm sempre as mesmas cores: **azul `#2A78D6`** já estava pronto,
**verde `#1BAF7A`** feito no período, **âmbar `#EB6834`** falta. Âmbar e não
cinza — num card cujo ponto é ver o que falta, cinza vira fundo e some.

Os cards `onde_falta` e `onde_foi_feito` trazem a coluna `onde` com os
apartamentos nomeados, em ordem natural (`APT-9` antes de `APT-11`). É o que
transforma "faltam 216 soleiras" em ordem de serviço.

## Limitações do Metabase que moldaram estes cards

Duas coisas que a UI não faz e que custaram cards quebrados. Não tente de novo:

**1. Não existe pivot em pergunta nativa.** Pôr `display: "pivot"` num card de
SQL faz a UI responder *"Pivot tables are only supported for questions built in
the query builder"* e o card não renderiza — mas a API **aceita o card sem
erro**, e `POST /api/card/:id/query` devolve as linhas normalmente. Ou seja:
dá para provar que a query roda e ainda assim ter um card em branco na tela.

Por isso os dois mapas são **transpostos no próprio SQL** (uma coluna por
prumada, uma por local) e sobem como tabela com escala de cor — o `viz:
heatmap` e `heatmap_falta` do front-matter, traduzidos para `display: "table"`
pelo `DISPLAY` do `provision.ts`.

O preço da transposição em SQL é que as colunas ficam fixas no card. Por isso
os dois mapas têm uma coluna **`Outras`/`Outros`**: se o modelo passar a
produzir uma prumada ou um local fora da lista, ele aparece ali com número em
vez de sumir da grade calado. Coluna com número = a lista precisa crescer.

**2. Gráficos colapsam categorias em "Other".** Por padrão o Metabase junta
tudo além das 8 primeiras categorias num balde `Other (N)` — no card *Por
serviço* isso escondia 2 dos 10 serviços, e o balde não diz quais são nem serve
para agir. Resolvido com `graph.max_categories_enabled: false` em todo card
`row`/`bar`, no `provision.ts`.

**O que isso ensina sobre verificar.** Rodar a query pela API prova que o SQL
está certo, não que o card aparece. Para visualização, o teste é abrir o
dashboard — foi você quem pegou os dois mapas, não a minha verificação.

## Desempenho

O dashboard inteiro roda em **~1,2 s de banco** (15 cards, ~80 ms cada). Chegou
a levar **~48 s**. O que mudou, em ordem de impacto:

**1. Uma subquery por vistoria, não por item.** `cag_vistoria` resolvia as tags
em cinco subqueries correlacionadas soltas no `SELECT` (uma por coluna). Como a
view é inlinada dentro do join com `application_items`, o planner as reavaliava
**uma vez por item**: `loops=6586`, cinco varreduras completas de `tags` cada.
Agrupadas num `LEFT JOIN LATERAL` só, viraram `loops=215` — uma por vistoria.
De 3,5 s para 0,25 s por card.

**2. CTEs `MATERIALIZED`.** Sem isso o Postgres re-inlina o corpo da CTE em
cada referência e desfaz a correção acima. Também evita recalcular o fato
quando um card o referencia várias vezes (a pizza usa 3, a curva usa 4). Quais
views são materializadas está no `MATERIALIZAR` do `build.py`.

**3. `GROUP BY` pela chave mínima.** O fato agregava já carregando `tags_arr`
(array), `tags` e `frente` (strings longas) — 14 colunas de ordenação sobre
6.586 linhas. Agora agrega por `(checklist_id, tags, item)` e junta a dimensão
`cag_frente` (60 linhas) depois. De 0,25 s para 0,08 s por card.

O custo de materializar é perder o pushdown de predicado para dentro da CTE.
Aqui não pesa: o fato inteiro tem 1800 linhas, e calcular tudo e filtrar depois
sai mais barato que reavaliar o corpo a cada referência. **Se a obra crescer
uma ordem de grandeza, é este o trade-off a revisitar** — e o caminho seria uma
`MATERIALIZED VIEW` de verdade, com refresh, em vez de CTE.

Ao mexer no modelo, confira que o resultado não mudou: rode cada card antes e
depois, com filtro e sem, e compare. Foi assim que apareceu o empate sem
desempate no card `paradas`, que fazia a tabela sair numa ordem diferente a
cada execução.

## O que este dashboard ainda não responde

**"Quem".** Não existe coluna de autor em `applications`. Mas o projeto tem
**12 tags com nome de pessoa** (`ADAILTON PEREIRA CRUZ`, `JOAO BATISTA`, …) que
nunca foram usadas em vistoria nenhuma. Se o app passar a marcar a vistoria com
a tag de quem a fez, "quem" passa a sair do filtro **Tags** sem migração de
schema nenhuma — é o caminho mais barato. A alternativa é
`ALTER TABLE applications ADD COLUMN created_by`.

**"Quando", com precisão de hora.** Só existe a data declarada da vistoria, dia
cheio.

**Outras tags estruturais não usadas.** `torre1`, `torre2`, `T1-A:FRENTE-RUA`,
`T2-B:FRENTE-PRAIA`, `Hidráulica`, `Áreas comuns`. Se passarem a ser aplicadas,
viram recortes no filtro **Tags** sem tocar em card nenhum. As tags `101`,
`oi`, `EDCLEY` e `LUIS` parecem lixo de teste e valem uma limpeza.
