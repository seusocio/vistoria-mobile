# Levantamento de obra — Metabase

Coleção **Andamento de obra** (id 5), banco `vistoria-app` (id 2).

| Dashboard | Estado |
|---|---|
| [**11 · Levantamento de obra**](https://meta.seusoc.io/dashboard/9) | **o que se usa.** 12 cards, 5 filtros |
| [10 · Andamento de obra](https://meta.seusoc.io/dashboard/8) | substituído pelo 11; ver *O que o 11 corrigiu* |
| `arquivo/` | primeira versão, modelo errado, só referência |

## O modelo

Três regras, e todo o resto sai delas:

1. **Frente = checklist + conjunto de tags**, não a tag sozinha. A mesma tag
   pode pertencer a checklists diferentes, com denominadores diferentes.
2. **O progresso é cumulativo.** Um item concluído continua concluído nas
   vistorias seguintes. O que importa por item é `concluido_em` — a primeira
   vistoria em que ele apareceu concluído. `NULL` = nunca foi concluído.
3. **A data é `applications.date`, nunca `answered_at`.** No banco o
   `answered_at` guarda quando a linha foi gravada, não quando o serviço foi
   feito. Datar por ele joga o histórico inteiro para o dia da carga.

Concluído = resposta com `semantic = 'positivo'` (vem das `options` do
checklist). `Não` e `Parcial` contam como respondidos, não como concluídos.

Hoje, no banco: **1 checklist · 60 frentes · 30 itens · 1800 itens de escopo**,
com vistorias em 16, 17, 22, 23 e 24/09.

## A ideia do dashboard 11

**Uma decomposição só, repetida em todo eixo de agrupamento.** Serviço, local,
frente e item respondem com as mesmas cinco colunas:

```
previsto · já estava pronto · feito no período · falta · % concluído
```

Somar `previsto` em qualquer um dos quatro eixos dá **1800**. É isso que torna
os cards comparáveis entre si — no dashboard 10 cada gráfico recortava o dado
de um jeito e os totais não fechavam.

As três faixas, sempre nestas cores:
**azul `#2A78D6`** já estava pronto · **verde `#1BAF7A`** feito no período ·
**âmbar `#EB6834`** falta. Âmbar e não cinza: num card cujo ponto é ver o que
falta, cinza é invisível.

## Os 12 cards

**Quando · o retrato da obra**

| Card | Responde |
|---|---|
| 11.1 | o placar: escopo, feitos, falta, %, avanço no período, último avanço |
| 11.2 | a pizza do escopo inteiro |
| 11.3 | linha do tempo cumulativa: % pronto em cada data |
| 11.4 | o que cada serviço avançou em cada data, e em quantos apartamentos |

**Qual · quantos · quanto falta · %** — os quatro eixos, as mesmas colunas

| Card | Eixo | Linhas |
|---|---|---|
| 11.5 | serviço | 10 |
| 11.6 | local | 9 |
| 11.7 | frente (apartamento) | 60 |
| 11.8 | **item do checklist** | 30 |

**Onde**

| Card | Responde |
|---|---|
| 11.9 | mapa serviço × local (pivot): os buracos de uma olhada |
| 11.10 | onde **falta**: quais apartamentos, por serviço e local |
| 11.11 | onde **foi feito**: quais apartamentos, com primeiro e último avanço |
| 11.12 | a lista nominal de pendências, para levar a campo (1036 linhas) |

Os cards 11.10 e 11.11 trazem a coluna `onde` com os apartamentos nomeados
(`APT-11, APT-12, …`), em ordem natural. É o que transforma "faltam 216
soleiras" em ordem de serviço. Substituem os cards 10.19/10.20/10.21, que
faziam isso num card separado por gráfico.

## O que o 11 corrigiu no 10

**1. Serviço e local, para os 30 itens.** Os títulos são `Base shaft: WC` —
serviço antes do `:`, local depois. O `split_part` cru acertava 26 e errava 4,
e os 4 vazavam para todo card de serviço:

| item | local no 10 | problema | local no 11 |
|---|---|---|---|
| `Soleira: WCs` | `WCs` | duplicava `WCS` | `WCS` |
| `Gas: Chumbar` | `Chumbar` | não é lugar | `Apartamento (todo)` |
| `Parede Lavanderia: Tipo 3, 6` | `Tipo 3, 6` | é tipologia | `Lavanderia` |
| `Lixa parede` | `—` | sem `:` | `Apartamento (todo)` |

Agora os 30 itens caem num par (serviço, local) válido: **10 serviços × 9
locais, zero órfãos**. E o **local virou eixo de primeira classe** (card 11.6):
no 10 ele só existia dentro dos cards de pendência.

**2. O item é chaveado pelo título, não pelo `checklist_item_id`.** O checklist
foi reeditado em algum momento e existem duas famílias de id para o mesmo bloco
de Contramarco (`citem_muey5bdl*` e `citem_mucmjxs4*`). As 34 vistorias de
24/09 carregam as duas. Como o bloco duplicado está todo `Sim`, o dashboard 10
**inflava o progresso da obra**:

| | escopo | concluído |
|---|---|---|
| dashboard 10 | 1936 | **46,3 %** |
| dashboard 11 | 1800 (= 60 × 30, exato) | **42,4 %** |

**3. Filtros que não se anulam mais.** Só as datas têm default. O Metabase marca
toda variável com default como `required: true`, e aí o `[[AND ...]]` deixa de
ser opcional — escolher uma frente e um serviço que não existe nela zerava o
card **sem erro nenhum** (mordeu em 10.10 e 10.18). Sem default, frente,
serviço e local são de fato opcionais: o dashboard abre na obra inteira e o
recorte é escolha explícita de quem olha.

**4. Doze cards em vez de 23.** Ficaram de fora, de propósito: o Gantt
(10.12/10.13 — o deslocamento é zero em todas as linhas, não informa nada), a
tabela de porte dos checklists (10.14 — só há um checklist), os pares "quais
tags" (10.21/10.22/10.23 — viraram a coluna `onde` dentro do próprio card) e os
recortes redundantes (10.2, 10.5, 10.7).

## Arquivos

| Arquivo | O que é |
|---|---|
| `11-levantamento.sql` | **a versão boa**: 3 views + 12 cards |
| `10-andamento.sql` | a versão anterior, mantida para comparação |
| `00-views.sql` | views base genéricas; o 11 não depende delas |
| `gen.py` | gera `standalone/` — **rode depois de editar qualquer `NN-*.sql`** |
| `standalone/` | **gerado, nunca edite**: cada card autossuficiente |
| `provision.ts` | cria/atualiza coleção, cards e dashboards via API REST |
| `arquivo/` | primeira versão, modelo errado |

`standalone/` existe porque o editor nativo do Metabase **não roda DDL nem
várias instruções**: colar um `CREATE VIEW` lá dá *"Select statement did not
produce a ResultSet"*. Então `gen.py` embute as views de que cada card depende
como CTE no topo, e o que sobe é um `SELECT` só.

## O fluxo

```bash
# 1. editar
vim docs/metabase/11-levantamento.sql

# 2. regenerar o standalone
python3 docs/metabase/gen.py

# 3. subir (idempotente: casa pelo nome do card e atualiza, não duplica)
export MB_URL=https://meta.seusoc.io
export MB_API_KEY=mb_...        # Admin → Settings → Authentication → API keys
bun run docs/metabase/provision.ts --database 2 --only 11 --collection "Andamento de obra"
```

`--dry-run` lista o que seria criado sem tocar em nada.
`--list-databases` descobre o id do banco.

Os defaults de `data_a`/`data_b` saem do banco a cada provisionamento
(`descobrirDefaults`): `data_b` = última vistoria, `data_a` = a penúltima data
distinta. Um default fixo tipo "30 dias atrás" cai antes de toda vistoria — aí
tudo vira "feito no período", a faixa azul zera e a pizza abre inteira verde.
Foi o que aconteceu na primeira versão.

## O que ainda não dá para responder

**"Quem".** Não existe coluna de autor em `applications`. Precisa de migração:

```sql
ALTER TABLE applications      ADD COLUMN created_by  text REFERENCES "user"(id);
ALTER TABLE application_items ADD COLUMN answered_by text REFERENCES "user"(id);
```

mais o preenchimento no app com o usuário da sessão. Os cards de produtividade
por pessoa já estão escritos em `arquivo/02-produtividade-pessoa.sql` e rodam
assim que a coluna existir (`provision.ts --include-pessoas`).

**"Quando", com precisão de hora.** Só existe a data declarada da vistoria,
dia cheio. Hora real exigiria gravar `answered_at` no momento da resposta.
