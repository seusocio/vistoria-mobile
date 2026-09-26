# Backend de Vistoria — especificação de construção

> **Onde**: `apps/vistoria-api`, app Elysia novo. `apps/produto-api` é boilerplate de outro
> produto: fica como referência de leitura (§3) e sai num `git rm` no fim. Depois vira repo separado.
> **Não é monorepo** — os cinco `@sst/*` viram arquivos locais em `src/lib/`.
> Prosa em pt-BR; identificadores, tabelas, endpoints e OpenAPI em inglês.
> Companheiro de `spec.md` (RF-01…RF-16 / RNF-01…RNF-10, o produto). Aqui é o servidor: RF-BE / RNF-BE.

> **O que fica no cliente**: montar o documento da aplicação, inclusive a base vinda da última
> visita (§4.5), e o drag-and-drop, que é um `PUT` do agregado de checklist (§4.6). Ambos
> funcionam hoje e mover para o servidor seria regressão.

> **O corte é dos dois lados.** O servidor é metade do trabalho; a outra é trocar o backend por trás
> da camada offline do app, que são **quatro costuras** e nenhum rewrite (§12.1). A ordem de
> execução está no §14, e o primeiro passo é no cliente, contra o Convex ainda de pé.

---

## Context

O protótipo está em produção de fato: `ADR/0011-daily-inspection-report.md` registra 54 unidades,
10 andares e 447 fotos num único dia (2026-09-23). O Convex está sendo usado como banco de
documentos com três tabelas gordas onde item, anexo e opção de resposta são arrays JSON embutidos
(`convex/schema.ts:5-48`). Duas dores concretas:

1. **Toda agregação roda no cliente.** `/overview` puxa *todas* as aplicações com *todos* os itens
   e anexos para calcular progresso e pendências em memória
   (`src/features/report/shared/report.utils.ts`). A Library faz o mesmo só para contar. O gerador
   de relatório diário faz N+1 (`applications:findById`, concorrência 6) porque só o `findById`
   resolve URL de anexo (`convex/applications.ts:24-48`).
2. **Campo novo = mexer no schema.** `workflowStatus`, `checklistItemId` e `parentId` são
   `v.optional` só por retrocompatibilidade com linhas antigas (`convex/validators.ts:57-62`).

O alvo: Postgres + Drizzle + R2 sobre Elysia. **Coluna para o que o servidor consulta; `metadata`
jsonb para o resto.** Três máquinas de estado em código. Mutations síncronas. Sem auth.

### Decisões já fechadas

| Decisão | Valor |
|---|---|
| Paginação | Envelope `{ data, meta.pagination }` em **todo** GET; params planos (`page`, `pageSize`, `sort`, filtros diretos). O formato do Strapi é **referência de forma** — Strapi não entra no projeto |
| Mutations | **Síncronas**, dentro de uma transação. `201` no create, `200` no update/delete |
| Metadado | Núcleo tipado + `metadata jsonb` em cada tabela; conteúdo livre, não validado |
| Máquinas de estado | Em código, uma por entidade |
| IDs | Aceita id do cliente quando vem, gera quando não vem; toda escrita idempotente |
| Auth | Fora de escopo. Nenhuma coluna de usuário/tenant |
| HTTP | Elysia + Bun, em `apps/vistoria-api` (app novo — §3) |

### Premissas declaradas

| Premissa | Por quê |
|---|---|
| **TypeBox (`t.Object`) nas rotas, não zod** | Você escolheu Elysia por DTO automático + OpenAPI. O `@elysiajs/swagger` renderiza TypeBox nativamente; zod v4 passa como Standard Schema e **valida**, mas não é introspectado para o schema OpenAPI — hoje o boilerplate usa zod e por isso o `/openapi` dele é praticamente uma lista de rotas (§3.4). TypeBox é o que faz o OpenAPI nascer de graça. Como todos os módulos do boilerplate morrem (§3.1), escrever as rotas novas em TypeBox custa o mesmo que escrevê-las em zod |
| `response:` declarado em toda rota | O boilerplate nunca declara — é exatamente o que falta para o doc ser útil |
| `@aws-sdk/client-s3` + `s3-request-presigner` | Já é a escolha do boilerplate e R2 é S3-compatível |
| `timestamptz` no banco, ISO 8601 UTC no wire | O cliente já produz e consome ISO. Fuso é do app (`RNF-01`) |
| Sem fila, sem Redis, sem cron | O cliente já tem outbox persistido (`ADR/0009`). `@elysiajs/cron` **sai** do `package.json` |

---

## 1. A tese: coluna ou `metadata`?

> **É coluna se o servidor consulta, ordena, agrega, junta ou guarda transição por aquele campo —
> ou se o cliente já o lê achatado hoje. Todo o resto vai em `metadata`.**

A segunda metade da regra é o que evita uma camada de projeção inteira. Campo que o SQL ignora mas
que o front já renderiza (`note`, `quantity`, `mimeType`) continua coluna: é grátis, não exige
tradução entre a linha e o DTO, e o payload fica idêntico ao que `convex/validators.ts` já entrega.

### 1.1 Coluna porque o SQL usa

| Campo | Por que |
|---|---|
| `applications.status` | Guardado por máquina de estado; agregado em `RF-BE-12` |
| `applications.date` | Filtro de período do relatório e do diário (`BETWEEN`) |
| `applications.checklist_id` | FK + índice do histórico |
| `application_items.answer` | `''` vs não-`''` **é** a definição de progresso, contada em SQL |
| `application_items.position` | `ORDER BY` |
| `application_items.workflow_status` | Máquina de estado |
| `attachments.upload_status` | Máquina de estado + varredura de pendentes |
| `attachments.position` | `ORDER BY` na galeria e no laudo |
| `checklists.options` (jsonb) | A contagem de negativas (`RF-07.1`) é join entre `answer` e `semantic`. Fica jsonb porque é sempre lido inteiro |
| `applications.tags_ids`, `application_items.tags_ids` (`text[]` + GIN) | `RF-BE-12` é interseção AND em **dois níveis**. Como tabela de junção custaria uma tabela a mais (§2.0) |
| `*.deleted_at` | Todo filtro tem `WHERE deleted_at IS NULL` |

### 1.2 Coluna porque o wire já usa

`application_items.note`, `.quantity`, `.description`; `applications.transcript`;
`attachments.mime_type`, `.width`, `.height`; `checklists.source`.

São 8 colunas pequenas que o Convex já expõe achatadas (`convex/validators.ts:8-70`). Como coluna,
a paridade de payload do §13 é literal — nenhuma transformação entre a linha e o DTO.

### 1.3 `metadata jsonb` — o campo novo sem migração

`checklists`, `applications`, `application_items` e `attachments` ganham
`metadata jsonb NOT NULL DEFAULT '{}'`. Prazo, custo, severidade, número de NC: entram aí, sem
migração, sem tabela, sem endpoint.

**`metadata` viaja como objeto, não achatado.** `PATCH /application-items/:id` com
`{ "metadata": { "severidade": "alta" } }` faz *merge raso* na coluna (chave com valor `null`
remove). O `GET` devolve `"metadata": { "severidade": "alta" }`. Nada de projeção, nada de
`owner_type`, nada de lista de chaves conhecidas — a implementação inteira é um merge de jsonb no
`UPDATE`.

Quando um campo de `metadata` começar a ser consultado em SQL, ele **vira coluna** — uma migration
de `ALTER TABLE ... ADD COLUMN` + um `UPDATE ... SET x = metadata->>'x'`. Esse é o caminho de saída
previsto, não uma falha do desenho.

### 1.4 Considerado e rejeitado

| Ideia | Rejeitada porque |
|---|---|
| Tabela `metafields` estilo Shopify (`owner_type`/`key`/`type`/`value`) | Os campos são 6, conhecidos e fixos; nenhum requisito consulta por key entre entidades. Custa uma query extra e um agrupamento em memória em **todo** endpoint de lista — recria o N+1 que este port existe para matar — mais achatamento na leitura e desachatamento no patch. `metadata jsonb` entrega o mesmo "campo novo sem migração" com zero código |
| `metafield_definitions` com validações | Typed-no-validation já era a escolha; tabela sem enforcement é peso morto |
| Checklist = metaobject definition, item = field definition, resposta = metafield value | Quebra progresso (`RF-BE-11`) e negativas (`RF-07.1`) em `jsonb` sem índice |
| Máquinas de estado em tabela | Três máquinas conhecidas. Configurável para um caso que não existe |
| Fila `jobs` + mutations `202` (§5) | Duplica o outbox do `ADR/0009` e quebra o overlay otimista |
| `domain_events` + `mutateWithEvent` (Princípio I do boilerplate) | Exige `actor_id NOT NULL` sem ter login, e audita cada tecla |
| `@sst/attachments` (folders/files/file_versions/attachments) | 39 arquivos, versionamento imutável e `owner_id` que sem auth vira constante. Foto de vistoria não tem versão. Salvamos as duas coisas que importam: `requestChecksumCalculation: "WHEN_REQUIRED"` e o confirm por `HEAD` (§4.3) |

---

## 2. Modelo de dados

`src/db/schema.ts`. Estilo do boilerplate: export camelCase plural, tabela snake_case, colunas
explicitamente snake_case, `timestamp(..., { withTimezone: true })`.

Divergência consciente: o boilerplate **não tem soft delete em lugar nenhum** (usa `status` +
`archived_at`). Vistoria exige exclusão lógica em tudo (`spec.md` RNF-05), então `deleted_at` entra.

### 2.0 Por que 5 tabelas, e não 9

O Convex resolve o domínio com 3 tabelas porque item, anexo e opção de resposta são arrays JSON
dentro do pai. Normalizar tudo daria 9. **Só normaliza o que o servidor agrega**:

| Tabela | Veredito | Motivo |
|---|---|---|
| `tags` | fica | catálogo global, deduplicado por `normalized_label` |
| `checklists` | fica | e absorve `items` como jsonb (abaixo) |
| ~~`checklist_items`~~ | **jsonb em `checklists.items`** | o servidor nunca consulta um item de modelo isolado: é sempre lido junto do checklist e **substituído em bloco** no `PUT` (`RF-BE-08`). Nunca é agregado, nunca ordenado em SQL. É a mesma razão pela qual `options` já é jsonb |
| `applications` | fica | filtrada por data/status/checklist, é o eixo de todo relatório |
| `application_items` | fica | **é a tabela que justifica o port**: progresso é `COUNT(answer <> '')`, pendências é `WHERE answer = ''`, negativas é join com `options` |
| `attachments` | fica | varredura de upload pendente e ordenação por `position` no laudo |
| ~~`taggings`~~ | **`text[]` + GIN** | `@>` com índice GIN resolve a interseção AND dos dois níveis sem tabela de junção — e a ausência de FK é **requisito**: `spec.md` §2.3 exige que a referência sobreviva à exclusão lógica da tag |
| ~~`metafields`~~ | **coluna `metadata jsonb`** | §1.3 |
| ~~`jobs`~~ | **não existe** | §5 |

Resultado: **5 tabelas, zero de infra.** Contra as 3 do Convex, as duas a mais são exatamente as
que transformam o relatório de query-em-JS em query-em-SQL — o motivo do port existir.

**E o modelo *menor*?** A alternativa oposta à das 9 tabelas é copiar o Convex literalmente —
`applications.items` como jsonb — e resolver `RF-BE-11`/`RF-BE-12` com `jsonb_array_elements`. Na
escala medida isso performa de sobra e encolheria o script de importação do §12 para uma cópia 1:1.
Foi rejeitada por uma razão que não é performance: **`PATCH /application-items/:id` é a escrita mais
frequente do app** — cada toque numa resposta é uma op (`applications.patchItem`) — e patchar um
elemento dentro de um array jsonb significa achar o índice, `jsonb_set`, e reescrever a linha
inteira da aplicação a cada toque. Duas telas da mesma vistoria passam a conflitar no nível da
linha, e o `answered_at`/`workflow_status` do §6 viram manipulação de JSON em vez de `UPDATE` de
coluna. `application_items` como tabela custa ~20 linhas no importador e paga isso de volta em todo
o resto. `checklists.items` fica jsonb justamente porque não tem essa escrita: é sempre substituído
em bloco (§4.6).

```
tags
  id                text PK                    -- id do cliente ou uuid gerado
  label             text NOT NULL
  normalized_label  text NOT NULL              -- trim + lowercase
  created_at, updated_at, server_updated_at, deleted_at
  UNIQUE INDEX tags_normalized_active ON (normalized_label) WHERE deleted_at IS NULL

checklists
  id PK, title text NOT NULL,
  source    text,
  tags_ids  text[] NOT NULL DEFAULT '{}',
  options   jsonb  NOT NULL DEFAULT '[]',      -- [{ label, semantic }]
  items     jsonb  NOT NULL DEFAULT '[]',      -- [{ id, position, title, description,
                                               --    tagsIds, parentId, deletedAt }]
  metadata  jsonb  NOT NULL DEFAULT '{}',
  created_at, updated_at, server_updated_at, deleted_at
  INDEX (deleted_at)
  GIN INDEX (tags_ids)

applications
  id PK
  checklist_id  text NOT NULL REFERENCES checklists(id)
  tags_ids      text[] NOT NULL DEFAULT '{}'   -- torre, unidade, responsável; >= 1 elemento
  date          timestamptz NOT NULL
  status        text NOT NULL DEFAULT 'draft'  -- draft | completed
  transcript    text
  gallery_source_application_id text REFERENCES applications(id)
  metadata      jsonb NOT NULL DEFAULT '{}'
  created_at, updated_at, server_updated_at, completed_at, deleted_at
  INDEX (checklist_id, deleted_at)
  INDEX (date) WHERE deleted_at IS NULL
  INDEX (server_updated_at)
  GIN INDEX (tags_ids)

application_items
  id PK
  application_id    text NOT NULL REFERENCES applications(id) ON DELETE CASCADE
  checklist_item_id text                       -- id dentro de checklists.items; NULL = avulso
  parent_id         text
  position          integer NOT NULL
  title             text NOT NULL
  description       text NOT NULL DEFAULT ''
  tags_ids          text[] NOT NULL DEFAULT '{}'
  answer            text NOT NULL DEFAULT ''   -- label da option; '' = sem resposta
  answered_at       timestamptz
  note              text NOT NULL DEFAULT ''
  quantity          integer
  suggested         boolean NOT NULL DEFAULT false
  suggestion_source text                       -- transcript | previous_application | NULL
  workflow_status   text                       -- in_progress | in_review | denied | NULL
  metadata          jsonb NOT NULL DEFAULT '{}'
  created_at, updated_at, server_updated_at, deleted_at
  INDEX (application_id, position)
  INDEX (application_id) WHERE answer = '' AND deleted_at IS NULL    -- pendências
  GIN INDEX (tags_ids)

attachments
  id PK
  application_id      text NOT NULL REFERENCES applications(id) ON DELETE CASCADE
  application_item_id text REFERENCES application_items(id) ON DELETE CASCADE
                      -- NULL = galeria da visita (o sentinela `itemId: null` de hoje)
  position       integer NOT NULL
  name           text NOT NULL
  storage_key    text
  upload_status  text NOT NULL DEFAULT 'pending'   -- pending | uploaded | failed
  size_bytes     bigint
  checksum       text                              -- ETag do HEAD
  mime_type      text
  width          integer
  height         integer
  metadata       jsonb NOT NULL DEFAULT '{}'
  created_at, updated_at, server_updated_at, deleted_at
  INDEX (application_id, application_item_id, position)
  INDEX (upload_status) WHERE upload_status <> 'uploaded' AND deleted_at IS NULL
```

### 2.1 Disclosures do modelo

- **`answer` guarda o *label* da opção, não um id.** Renomear "Não - sem acesso" no checklist órfã
  o histórico. É o comportamento atual (`convex/validators.ts:45`), mantido por compatibilidade.
  `RNF-BE-09` registra o risco; corrigir é migração de dados, não campo novo.
- **`parent_id` existe e continua sem uso.** O agrupamento por ambiente ("Cozinha: Pintura") é
  derivado do prefixo `"Label: "` do título (`groupItemsByTitlePrefix`). **O servidor não parseia
  esse prefixo em lugar nenhum** — é heurística de apresentação.
- **"Unidade" não é entidade.** O histórico agrupa por igualdade exata de conjunto de tags
  (`RF-07.1`). Nenhuma tabela `units`.
- **`updated_at` é relógio do cliente**, então LWW está sujeito a skew. Aceito: single-inspector por
  vistoria. `server_updated_at` (`DEFAULT now()`) é o que o delta sync usa.
- **Exclusão de tag não limpa `tags_ids`** (`spec.md` §2.3). É justamente por isso que tag é
  `text[]` e não FK. `GET /tags?includeDeleted=true` resolve o label dessas tags no histórico.
- **Item de checklist não tem tabela** (§2.0), então o `checklist_item_id` de `application_items` é
  uma string solta, sem FK — que é exatamente o que ele já é hoje no Convex.
- **Escrita em filho bumpa o pai.** `application_items` e `attachments` têm o seu próprio
  `server_updated_at`, mas toda escrita neles também faz `UPDATE applications SET server_updated_at
  = now()` dentro da mesma transação. Sem isso, `updatedSince=` (`RF-BE-20`) perde a resposta de um
  item e a confirmação de um upload — as duas escritas mais frequentes do app — porque o cliente
  sincroniza no nível da aplicação, que é o agregado que ele lê (`GET /applications/:id`).
- **`application_items.position` não é a ordem de exibição.** A ordem vem do índice do item dentro
  de `checklists.items`, porque é o modelo que o drag reordena (§4.6). `position` serve para
  desempate estável e para posicionar item avulso no fim.

---

## 3. O que aproveitar de `apps/produto-api`

O app tem 160 arquivos / ~18.8k LOC. Sobra pouco, e o que sobra é bom.

App novo: `bun create elysia apps/vistoria-api`, trazendo por cópia só o que sobrevive —
`http/error.ts`, `lib/logger.ts` (12 linhas), o `onError`/OTel/cors de `index.ts`, e a linha
`requestChecksumCalculation: "WHEN_REQUIRED"` de `packages/attachments/src/s3.ts` (§4.3). O
`apps/produto-api` fica intocado como referência de leitura até o corte fechar, e some num
`git rm` só. As tabelas abaixo valem como **inventário do que consultar antes de
descartar**, não como lista de deleção.

### 3.1 Apagar

| Caminho | LOC | Nota |
|---|---|---|
| `src/modules/{person,company,process,project,suggestion,checklist,user-settings,demo-item,events}/` | ~13.4k | Todo o domínio. **Ler `modules/demo-item/` antes de apagar**: 235 LOC, é o template canônico controller→usecase→repo |
| `src/modules/attachments/` | 4.3k | Substituído por um módulo de 1 tabela (§4.3). O `entity-owner-registry.ts` não tem análogo aqui |
| `src/auth.ts`, `src/auth.test.ts` | 51+ | Único arquivo que importa `better-auth` |
| `src/lib/email-templates/{otp,invitation}.ts`, `src/lib/notifier.ts` | — | E-mail transacional é de auth |
| `src/middleware/actor-scope.ts` | 161 | Multi-tenant de empresa/projeto. Nada aproveitável |

### 3.2 Manter quase intacto

`src/http/error.ts` (a única borda `Result`→HTTP), `src/lib/logger.ts` (12 linhas, JSON
estruturado), `src/otel.ts`, `src/db.ts`, `src/config.ts`.

### 3.3 Recriar local (eram `@sst/*`)

235 imports quebrados, mas o volume real é pequeno:

| Novo arquivo | Vem de | Conteúdo |
|---|---|---|
| `src/lib/result.ts` | `@sst/shared` | `Result`, `ok`, `fail`, `isFail`. `{_tag:'ok',value}` / `{_tag:'fail',error}` |
| `src/lib/pagination.ts` | substitui `Paginated<T>` | Envelope `{ data, meta.pagination }` (§4.1), não o keyset do boilerplate |
| `src/lib/id.ts` | novo | `ensureId(prefix, given?)` — id do cliente ou `crypto.randomUUID()` |
| `src/lib/env.ts` | `@sst/shared/env` | Só `DATABASE_URL`, `API_PORT`, `S3_*`, `WEB_ORIGINS`, `OTEL_*`. Fora: `MEILI_*`, `BETTER_AUTH_*`, `DOCUMENSO_*`, `SIGNATURE_PROVIDER`, `RESEND_*` |
| `src/lib/tx.ts` | `@sst/events` | Só `withTransaction`. **Sem** `mutateWithEvent`/`domainEvents` (§1.4) |
| `src/db/schema.ts` | `@sst/db` | §2. Sem `auth-schema`, sem `*_snapshots`, sem as 4 tabelas de anexo do package |
| `src/storage/r2.ts` | `@sst/attachments` | `presignPut`, `presignGet`, `headObject`, `deleteObjects` |

`package.json`: saem os `@sst/*` (5), `better-auth`, `@better-auth/cli` e **`@elysiajs/cron`** (não
há mais worker). Entram `postgres`, `drizzle-kit`, `@aws-sdk/client-s3`,
`@aws-sdk/s3-request-presigner`, `@sinclair/typebox`.

`tsconfig.json` extends `../../tsconfig.base.json`, que **não existe** neste repo — trocar por um
tsconfig próprio (strict + `noUncheckedIndexedAccess`, que é o que a base dava). Dockerfile copia
9 manifests de workspace por nome: reduzir a um. `vitest.config.ts`: tirar `BETTER_AUTH_*` e
`MEILI_*`, manter os defaults `S3_*` e `DATABASE_URL`.

### 3.4 `src/index.ts` — o que sobra

Reaproveitar: `onError` (422 `VALIDATION` / 500 + log), `onRequest`/`onAfterResponse` com span
OTel, `cors`, `/health`.

Apagar: `.mount(auth.handler)`, os 12 `.use(controller)`, `reindexAll(meiliClient, db)`,
`/demo/echo`, `ensureBucket`/`ensureBucketCors` (o bucket do R2 é provisionado fora), e o bloco de
cron do `import.meta.main` (não há mais tick — o que resolve de graça o problema de o `croner` não
dar `unref()` e pendurar a suíte).

Trocar: `swagger({ path: "/openapi" })` sem configuração → `swagger` com `documentation`
(título, versão, tags) e `response:` em toda rota, para o `/openapi` deixar de ser lista de rotas.

### 3.5 Convenções do boilerplate que ficam

- **`throw` só em `src/http/**`.** Use case e repository devolvem `Result`. Há um lint
  (`scripts/throw-boundaries.ts`) no repo original que vale trazer.
- Controller é plugin Elysia (`new Elysia({ prefix: '/x' })`), fino: valida, chama use case,
  traduz `Result`. Sem regra de negócio.
- Use case é uma função ou classe com as dependências injetadas, um arquivo por caso
  (`<verbo>-<substantivo>.usecase.ts`). Classe só quando há mais de uma dependência.
- Repository é classe Drizzle com `type Row = typeof t.$inferSelect` e um `toDTO` de módulo.
  Cada arquivo exporta a classe **e** uma instância pré-fiada.
- Erro é `{ error: string }` com mensagem em pt-BR minúscula. Status vem do `fail`, default 422.
- DTO em snake_case, datas como string ISO.

**Teste — um tipo por módulo.** `*.controller.test.ts` via `app.handle(new Request(...))` contra
**Postgres real**, que cobre controller + use case + repository de uma vez. Unitário só onde há lógica que não é I/O: as três
máquinas de estado (`domain/machines.test.ts`), o merge de `metadata`, e o SQL do
`/reports/tags`. Sem `usecase.test` com repo mockado e sem camada `bdd.test` separada — o docblock
DADO/QUANDO/ENTÃO continua, dentro do `controller.test`. Sem testcontainers: o banco de dev não é
truncado, então fixture usa prefixo `crypto.randomUUID().slice(0,8)`.

**Não** trazer: o `Paginated<T>` keyset (§4.1), `mutateWithEvent`, `Scope`/`actor` obrigatório (todo
handler do boilerplate abre com `if (!actor) 401` — aqui não há ator).

---

## 4. Contrato HTTP

### 4.1 Envelope

Todo GET, inclusive de recurso único:

```json
{ "data": {}, "meta": {} }
```

Listas carregam paginação:

```json
{ "data": [ ... ],
  "meta": { "pagination": { "page": 1, "pageSize": 25, "pageCount": 3, "total": 54 } } }
```

Params planos: `?page=1&pageSize=25&sort=date:desc` + filtros diretos (`checklistId`, `status`,
`from`, `to`, `updatedSince`, `include`). `pageSize` default 25, máximo 100.

> **Divergência do boilerplate, consciente.** Ele usa keyset cursor
> (`{next_cursor, prev_cursor, has_next, total_count}`) e o comentário em `pagination.ts` diz
> *"o front nunca pede dados por OFFSET/número de página"*. O formato aqui é `LIMIT/OFFSET` +
> `COUNT(*)`: página profunda degrada e o total custa uma segunda query. Na escala medida —
> 2 checklists, ~163 itens de modelo, 54–60 aplicações/dia — isso é irrelevante por anos, e `page`
> é o que o front novo espera. Se uma lista passar de ~10k linhas, o envelope não muda: só
> `pagination` ganha `cursor` ao lado de `page`.

**Mutations respondem o recurso.** `201` + `{ data: <recurso> }` no create, `200` + `{ data }` no
update, `200` + `{ data: { id } }` no delete. O cliente recebe o estado aplicado na mesma resposta
— é o que o `ADR/0009` espera para trocar o overlay otimista pelo valor do servidor sem piscar.

### 4.2 Endpoints — 19

| # | Método | Rota | Origem Convex |
|---|---|---|---|
| 1 | `GET` | `/health` | — |
| 2 | `GET` | `/tags?includeDeleted=` | `tags.list` / `listAll` |
| 3 | `POST` | `/tags` | `tags.create` |
| 4 | `GET` | `/checklists` | `checklists.list` + contadores |
| 5 | `GET` | `/checklists/:id` | `checklists.findById` |
| 6 | `POST` | `/checklists` | `checklists.save` (create) |
| 7 | `PUT` | `/checklists/:id` | `checklists.save` (replace do agregado) |
| 8 | `DELETE` | `/checklists/:id` | `softDeleteCascade` |
| 9 | `GET` | `/applications?checklistId=&status=&from=&to=&updatedSince=&include=` | `listByChecklistId`, `listAll` |
| 10 | `GET` | `/applications/:id` | `applications.findById` |
| 11 | `POST` | `/applications` | `applications.create` (agregado montado pelo cliente — §4.5) |
| 12 | `PATCH` | `/applications/:id` | `updateMeta` (tags, date, transcript, **status**) |
| 13 | `DELETE` | `/applications/:id` | `applications.softDelete` |
| 14 | `POST` | `/applications/:id/items` | `addItem` |
| 15 | `PATCH` | `/application-items/:id` | `patchItem` / `patchItems` |
| 16 | `POST` | `/applications/:id/attachments` | `addAttachment` (cria as linhas; **não** presigna) |
| 16b | `POST` | `/uploads/presign` | `files.generateUploadUrl` (lote de chaves determinísticas) |
| 17 | `PATCH` | `/attachments/:id` | `setAttachmentUploaded` / `setAttachmentUploadStatus` |
| 18 | `DELETE` | `/attachments/:id` | `setAttachmentDeletedAt` + `purgeAttachment` |
| 19 | `GET` | `/reports/tags?tagIds=&from=&to=` | `report.utils.ts` (era client-side) |

Rotas que **não** existem e por quê:

| Não existe | Coberta por |
|---|---|
| `GET /jobs/:id` | Não há fila; o erro volta na própria resposta (§5) |
| `DELETE /tags/:id` | Não existe UI de administração de tag (`spec.md` §10). Exclusão lógica fica para script |
| `POST /applications/:id/transitions` | `PATCH /applications/:id` aceita `status` e a máquina guarda |
| `PATCH /applications/:id/items` (lote) | `PATCH /application-items/:id` aceita `{ ids: [...] }` para marcar seção inteira |
| `GET/PUT/DELETE /metafields` | `metadata` viaja no corpo da entidade (§1.3) |
| `GET /reports/daily` | `GET /applications?from=&to=&include=items,attachments` |
| `POST /maintenance/purge-orphans` | Script CLI, não endpoint |

### 4.3 Fotos — o fluxo inteiro em 4 rotas

```
POST /applications/:id/attachments          (op de outbox: applications.addAttachment)
  { "attachments": [ { "id": "attachment_…", "itemId": null, "name": "Foto 1",
                       "mimeType": "image/jpeg" } ] }
→ 201 { "data": [ { "id": "attachment_…", "uploadStatus": "pending", … } ] }

POST /uploads/presign                       (fila de upload, fora do outbox)
  { "keys": [ { "attachmentId": "attachment_…", "contentType": "image/jpeg" } ] }
→ 200 { "data": [ { "key": "applications/…/attachment_….jpg", "uploadUrl": "https://…r2…",
                    "method": "PUT", "headers": { "Content-Type": "image/jpeg" },
                    "expiresAt": "…" } ] }

PUT  https://…r2…                           binário; resposta com corpo vazio

PATCH /attachments/attachment_…             (op de outbox: applications.setAttachmentUploaded)
  { "uploadStatus": "uploaded" }
→ 200   servidor faz HEAD no objeto e grava size_bytes + checksum reais; devolve o anexo
```

Chave: `applications/{applicationId}/{itemId ?? '_gallery'}/{attachmentId}.{ext}` — determinística,
reupload sobrescreve em vez de vazar órfão.

O presign fica separado porque `POST /applications/:id/attachments` **é** a op de outbox
`applications.addAttachment`, e o outbox (a) descarta a resposta da mutation
(`drain.ts:58-59` resolve o item sem ler o retorno) e (b) drena estritamente FIFO,
bloqueando no head quando uma op esgota as tentativas. A fila de upload
(`src/lib/uploads/upload-store.ts`) é deliberadamente **separada** do outbox, com retry
próprio, exatamente para que foto suba enquanto o resto espera.

Com a chave determinística acima, o presign não precisa de estado nenhum: o cliente já sabe
`applicationId`, `itemId` e `attachmentId` no momento em que tira a foto. `POST /uploads/presign`
é uma rota sem banco — assina e devolve. Custa ~15 linhas e preserva a independência das duas
filas.

Cinco disclosures, todas herdadas de dor real:

1. **O PUT do R2 não devolve corpo.** Hoje o cliente lê `{ storageId }` da resposta do Convex
   (`src/lib/convex/file-storage.ts:86-95`). Presigned PUT responde `200` vazio + `ETag`. Por isso
   a `key` vem **antes** do upload e o cliente nunca depende do corpo.
2. **`requestChecksumCalculation: "WHEN_REQUIRED"` é obrigatório** no `S3Client`. Sem ele o SDK
   (≥ v3.729) assina o CRC32 do corpo *vazio* na query string do presign e o R2 recusa o envio
   real. O boilerplate já carrega esse comentário em `packages/attachments/src/s3.ts` — é a única
   linha do package que vale copiar literalmente.
3. **O `PATCH` de confirmação não confia no cliente.** Faz `HEAD` na chave; objeto ausente →
   `uploadStatus` fica `failed`. Tamanho e checksum vêm do storage, nunca do corpo. (SigV4 PUT não
   carrega `content-length-range`, então o storage não limita tamanho — a rejeição por tamanho é só
   otimização no cliente.)
4. **Linha antes do binário, sempre.** Uma foto tirada offline não tem linha no servidor; a
   recuperação de upload depende da fila local (`ADR/0009`), não de varredura no servidor.
5. **As duas filas continuam independentes.** Outbox (escritas de domínio, FIFO, bloqueante) e fila
   de upload (binários, retry próprio, não bloqueante) não se serializam — só se encontram no fim,
   quando o upload conclui e enfileira `setAttachmentUploaded` no outbox. Qualquer rota que force
   uma a esperar pela outra é regressão.

`DELETE /attachments/:id` faz soft delete e **não apaga o blob**. A remoção do objeto fica para o
script de purge (§11), rodado sobre `deleted_at < now() - interval '30 days'`. Aqui há um bug
herdado a não repetir: hoje `applications.softDelete` e `checklists.softDeleteCascade` apagam
*todos* os blobs enquanto só marcam `deletedAt` (`convex/applications.ts:372-391`) — a exclusão é
anunciada como reversível mas as fotos já foram destruídas.

### 4.4 Servir imagem

`attachments[].url` é GET presigned com TTL de 1h (espelha o `ctx.storage.getUrl` do Convex), ou a
URL pública se `R2_PUBLIC_BASE_URL` estiver setado. **As listas também resolvem `url`** quando
`include=attachments` — é isso que mata o N+1 do gerador de relatório.

### 4.5 Quem monta a aplicação: o cliente

`POST /applications` recebe o agregado pronto e o grava. **O servidor não lê o checklist.**

```
POST /applications
  { "id": "application_x2", "checklistId": "seed-checklist-apartamentos",
    "tagsIds": ["tag_t1a","tag_apt84"], "date": "2026-09-24T12:00:00.000Z",
    "status": "draft", "gallerySourceApplicationId": "application_x1",
    "items": [ { "id": "aitem_10", "position": 0, "checklistItemId": "citem_001",
                 "title": "Base shaft: Cozinha", "answer": "Sim", "note": "",
                 "suggested": true, "suggestionSource": "previous_application",
                 "answeredAt": "2026-09-24T12:00:00.000Z", "tagsIds": [] } ] }
→ 201 { "data": { …a aplicação relida, com items[] } }
```

É exatamente o que `applications.create` faz hoje (`convex/applications.ts:90-97`: recebe
`applicationDoc` inteiro, insere se o id não existe). Quem monta é o front:

- `buildApplication(input, checklist)` — copia os itens não-excluídos do modelo, gera `aitem_*`,
  herda `tagsIds` do item de modelo (`application.utils.ts:13-62`).
- `buildRepeatedApplication(source, checklist, overrides)` — a **base**: para cada item do modelo
  procura o correspondente na visita anterior (por `checklistItemId`, caindo para `position`),
  herda `answer`/`note`/`quantity`/`tagsIds`, marca `suggested: true` +
  `suggestionSource: 'previous_application'`, **zera `workflowStatus`** (o "em revisão" da visita
  passada não se carrega), reanexa os itens avulsos que não existem no modelo, limpa `attachments`
  e seta `gallerySourceApplicationId` (`application.utils.ts:84-146`).

Três razões para não mover isso para o servidor:

1. **O outbox precisa do documento completo.** O `ADR/0009` exige `applyLocal` — o overlay otimista
   é a *mesma* função que o servidor aplicaria. Se o servidor derivasse os itens, o cliente teria de
   derivar de novo para a tela responder offline: duas implementações da mesma regra, exatamente o
   que o ADR proíbe.
2. **Criar vistoria funciona sem rede hoje** e tem de continuar funcionando. Com derivação no
   servidor, a tela de nova aplicação passaria a depender de um round-trip.
3. São ~60 linhas puras já testadas, e a regra é de produto (o que se sugere da visita anterior),
   não de persistência.

O servidor valida forma (TypeBox), unique de id e as máquinas de estado — nada além disso.
`POST /applications` com um `id` já existente é no-op e devolve o recurso existente (`RF-BE-01`).

### 4.6 Drag-and-drop: continua sendo `PUT /checklists/:id`

DND existe em duas telas e **as duas escrevem o checklist**, não a aplicação:

| Tela | O que o drag faz | Rota |
|---|---|---|
| `checklistForm` | `reorderChecklistItems` renumera `position` de todos os itens do modelo e enfileira `checklists.save` | 7 |
| `applicationFill` | traduz as posições visíveis para os `checklistItemId` de origem e destino, chama o **mesmo** `reorderChecklistItems` e enfileira `checklists.save` (`ApplicationItemGroupSection.tsx:102-128`) | 7 |

Ou seja: reordenar no preenchimento reordena o **modelo**, e todas as aplicações daquele checklist
passam a exibir na ordem nova. É o comportamento atual, deliberado, e o `PUT` de agregado
(`RF-BE-08`) já o cobre inteiro — **nenhuma rota de reorder é necessária**.

Consequência que o servidor precisa respeitar: **a ordem de exibição dos itens de uma aplicação não
é `application_items.position`.** É `sortItemsByChecklistOrder` (`application.utils.ts:213-231`):
rank pelo índice do item dentro de `checklist.items`, `position` só como desempate, item avulso
(`checklistItemId: null`) no fim. A tela de preenchimento já carrega a aplicação **e** o checklist
(rotas 10 e 5), então **a ordenação de exibição fica no cliente**, como hoje. O servidor devolve
`ORDER BY position, id` — determinístico e estável, nada mais. Ordenar por `position` no servidor e
chamar isso de "a ordem" seria o bug: depois de um drag, o refetch traria a ordem antiga.

O consumidor que **não** tem o checklist em mãos é o gerador de laudo (`reports/`). Ele pede
`include=items` junto de `GET /checklists/:id` e aplica a mesma função — por isso
`sortItemsByChecklistOrder` fica em `src/features/application/shared/`, compartilhada, e não
duplicada no servidor.

---

## 5. Mutations síncronas

Toda mutation é:

```
request → TypeBox valida o corpo                      → 422 se falhar
        → resolve id (do cliente ou gerado)
        → withTransaction:
            - carrega o alvo                          → 404 se não existe
            - máquina de estado valida a transição    → 409 se ilegal
            - aplica (LWW por campo, merge de metadata)
            - re-lê o agregado
        → 200/201 { data: <recurso aplicado> }
```

Unique de tag é garantido pelo `UNIQUE INDEX` parcial, e a violação **não é erro**:
`POST /tags` faz `INSERT ... ON CONFLICT DO NOTHING`, re-lê e devolve `200` com a tag existente.
É o que `convex/tags.ts:40-58` já faz (procura por `id`, depois por `normalized_label` ativo,
devolve a existente antes de inserir) e é o que `RF-BE-06` exige.

Responder `409` aqui seria um bug de disponibilidade, não um detalhe de contrato: duas telas
criando "Torre 1" offline enfileiram duas `tags.create`; a segunda falharia 5 vezes e **travaria a
fila inteira**, porque `drain.ts` bloqueia no head em vez de pular (`src/lib/offline-queue/drain.ts:30-37`).
`409` fica só para transição ilegal de máquina de estado (§6).

### 5.1 Por que não há fila

Responder `202` e aplicar num worker seria construir no servidor a fila que o cliente **já tem**:
o `ADR/0009` declara o outbox persistido como o único caminho de escrita, drenado FIFO e
serialmente, com `applyLocal` como overlay otimista. Dois outboxes em série não dão mais garantia
que um, e o segundo custaria: tabela `jobs`, `jobs/{queue,worker,handlers/*}`, tick de cron,
retry com backoff, ordenação por `target_id`, uma rota `GET /jobs/:id` e a validação de unique
feita duas vezes.

Pior: o `ADR/0009` tira o op da fila **quando a mutation resolve**, e é esse sinal que solta o
overlay. Com `202`, a mutation resolve no enqueue — o overlay cairia antes de o servidor ter
aplicado, e o `useQuery` seguinte devolveria o valor antigo. A tela piscaria para trás. Mutation
síncrona é o que o cliente já assume.

Se um dia alguma operação ficar longa (gerar PDF, reprocessar imagem), ela entra como um job
isolado *daquela* operação — não como o caminho de escrita de todo o domínio.

---

## 6. Máquinas de estado

`src/domain/machines.ts`. Três tabelas de transição `const`, aplicadas dentro da transação do use
case. Transição ilegal → `409` com `{ error: "transição ilegal: uploaded → pending" }`.

**`application.status`**
```
draft ──complete──▶ completed      (completed_at = updatedAt)
completed ──reopen──▶ draft        (completed_at = null)
```
`draft→draft` e `completed→completed` são no-op idempotente, não erro — replay do outbox é normal.
`reopen` não existe na UI hoje (só no seed `cloneBaselineForward`), mas a operação é real e custa
uma linha.

**`application_item.workflow_status`** — grafo completo entre `in_progress`, `in_review`, `denied`,
mais `null` como origem e destino de todos.

Invariantes acopladas, hoje duplicadas nos dois handlers do Convex (`convex/applications.ts:112`
e `:137`) e que aqui vivem num só lugar:
- `suggested === false` → `suggestion_source = null`
- `answer` mudou → `answered_at = answer ? updatedAt : null`
- item marcado completo (`answer` de `semantic: positivo`) → `workflow_status = null`

**`attachment.upload_status`**
```
pending ──▶ uploaded   (só após HEAD bem-sucedido; grava size_bytes + checksum)
pending ──▶ failed
failed ──▶ pending     (retry)
uploaded ──▶ ✗         (terminal)
```
`uploaded` terminal é o que o Convex já tenta garantir deixando o validator de
`setAttachmentUploadStatus` aceitar só `pending|failed`.

---

## 7. Requisitos

### 7.1 Funcionais

| # | Requisito |
|---|---|
| **RF-BE-01** | Toda escrita é idempotente pelo id do alvo. `POST` sem id gera um; `POST` com id existente é no-op e devolve o recurso existente; `PUT` substitui o agregado; `PATCH` é LWW por campo |
| **RF-BE-02** | Toda mutation é síncrona e devolve o recurso aplicado: `201` no create, `200` no update/delete |
| **RF-BE-03** | Falha de escrita volta na própria resposta, com status e `{ error }` em pt-BR. Nenhuma escrita é aceita e perdida depois |
| **RF-BE-04** | Todo `GET` responde `{ data, meta }`; listas trazem `meta.pagination` com `page`, `pageSize`, `pageCount`, `total`. `pageSize` default 25, máx 100 |
| **RF-BE-05** | `PATCH`/`DELETE` em alvo inexistente respondem **404**. Escrita nunca é descartada em silêncio — hoje o Convex responde `null` e a escrita evapora |
| **RF-BE-06** | `POST /tags` é idempotente por `id` e por `normalized_label` ativo. Tag logicamente excluída não bloqueia nova com o mesmo label |
| **RF-BE-07** | Exclusão de tag é lógica e **não** remove referências em `tags_ids` |
| **RF-BE-08** | `PUT /checklists/:id` substitui o conjunto de itens: item ausente do corpo é removido |
| **RF-BE-09** | `DELETE /checklists/:id` marca `deleted_at` no checklist e em todas as suas aplicações não-excluídas, numa transação, **sem tocar o R2** |
| **RF-BE-10** | `POST /applications` recebe o agregado **já montado pelo cliente** (aplicação + `items[]`, com ids do cliente) e o insere numa transação. O servidor não lê o checklist, não copia item e não deriva sugestão — quem monta é `buildApplication`/`buildRepeatedApplication` (§4.5) |
| **RF-BE-11** | Progresso é `COUNT(answer <> '') / COUNT(*)` sobre itens não-excluídos, calculado na leitura, **nunca persistido**. Qualquer resposta conta, independente do `semantic` |
| **RF-BE-12** | `GET /reports/tags` filtra aplicações com **todas** as tags pedidas, olhando tags da aplicação **e** de seus itens; tag ausente no nível da aplicação restringe a contagem aos itens que a têm. Devolve `itemProgress`, `applicationProgress`, `pendingGroups`. `deleted_at` fica fora de numerador e denominador |
| **RF-BE-13** | `GET /checklists` devolve `applicationsCount` e `completedCount` por checklist |
| **RF-BE-14** | `include=attachments` resolve `url` em listas, igual ao detalhe |
| **RF-BE-15** | `POST /applications/:id/attachments` aceita lote e cria as linhas; `POST /uploads/presign` devolve `key` + `uploadUrl` de cada uma, sem tocar o banco |
| **RF-BE-16** | A confirmação de upload faz `HEAD` no objeto e grava `size_bytes`/`checksum` do storage. Objeto ausente → `failed` |
| **RF-BE-17** | `PATCH /application-items/:id` aceita `{ ids: [...] }` para aplicar o mesmo patch a vários itens (marcar seção inteira) |
| **RF-BE-18** | `metadata` é um objeto livre em `checklists`, `applications`, `application_items` e `attachments`; o `PATCH` faz merge raso (chave com `null` remove) e não valida conteúdo. Campo novo não exige migração |
| **RF-BE-19** | Os campos que o cliente já lê achatados (`note`, `quantity`, `description`, `transcript`, `mimeType`, `width`, `height`, `source`) são colunas e viajam achatados, idênticos ao payload do Convex |
| **RF-BE-20** | `updatedSince=` devolve o que mudou por `server_updated_at`, incluindo tombstones. Escrita em `application_items` ou `attachments` bumpa o `server_updated_at` da aplicação-pai na mesma transação (§2.1) |

### 7.2 Não funcionais

| # | Requisito |
|---|---|
| **RNF-BE-01** | Sem autenticação nem autorização. Nenhuma coluna de usuário/tenant. **Não expor publicamente sem uma camada na frente** |
| **RNF-BE-02** | Id do cliente é aceito quando vem (prefixado: `application_*`, `aitem_*`, `citem_*`, `tag_*`, `attachment_*`) e gerado quando não vem |
| **RNF-BE-03** | Wire em ISO 8601 UTC, banco em `timestamptz`. Nenhuma lógica de fuso no servidor |
| **RNF-BE-04** | Soft delete universal; toda listagem filtra `deleted_at IS NULL` salvo pedido explícito |
| **RNF-BE-05** | Exclusão lógica nunca apaga binário. Purge é script, sobre `deleted_at` com mais de 30 dias |
| **RNF-BE-06** | Erros: `400` corpo malformado, `404` inexistente, `409` unique/transição ilegal, `422` schema/regra, `5xx` infra. Corpo `{ error: string }` em pt-BR, no formato do boilerplate |
| **RNF-BE-07** | `throw` só em `src/http/**`. Use case e repository devolvem `Result` |
| **RNF-BE-08** | Ordenação sempre explícita e **estável**: `application_items` por `(position, id)`, anexos por `(position, id)`, aplicações por `date DESC, id`. A ordem de **exibição** dos itens não é essa — é a do checklist, resolvida no cliente (§4.6) |
| **RNF-BE-09** | LWW usa `updated_at` do cliente e está sujeito a skew. Sync usa `server_updated_at` |
| **RNF-BE-10** | Escala medida: 2 checklists, ~163 itens de modelo, 54–60 aplicações/dia, ~450 fotos/dia. Paginação é `LIMIT/OFFSET`; reavaliar em ~10k linhas por lista |
| **RNF-BE-11** | Presign: máx 100 anexos por request, PUT expira em 15 min, GET em 1 h |
| **RNF-BE-12** | Todo agregado (`/reports/*`, contadores de `/checklists`) resolve em SQL. Nenhum handler carrega tabela inteira em memória |
| **RNF-BE-13** | Toda rota declara `body`/`query`/`response` em TypeBox, e `/openapi` é gerado a partir disso — não mantido à mão |

---

## 8. Casos de uso → endpoints

| # | Caso de uso | Tela | Rotas |
|---|---|---|---|
| UC-01 | Biblioteca com métricas | `home` | 4, 2 |
| UC-02 | Buscar/filtrar modelos | `home` | cliente sobre UC-01 |
| UC-03 | Criar checklist (zero ou template) | `checklistNew` | 3, 6 |
| UC-04 | Editar checklist (auto-save) | `checklistEdit` | 5, 7 |
| UC-05 | Duplicar checklist | `checklistDetail` | 6 |
| UC-06 | Excluir checklist + aplicações | `checklistDetail` | 8 |
| UC-07 | Histórico agrupado por conjunto de tags | `checklistDetail` | 5, 9 |
| UC-08 | Editar tags de um grupo | `checklistDetail` | 12 ×N |
| UC-09 | Criar aplicação (tags + data) | `applicationNew` | 9, 3, 11 (`buildApplication` no cliente) |
| UC-10 | Repetir vistoria com as mesmas tags (base da última) | `checklistDetail` | 11 com o doc de `buildRepeatedApplication` (§4.5) |
| UC-11 | Abrir e preencher | `applicationFill` | 10, 5 |
| UC-12 | Responder item / nota / qtd / tags | `applicationFill` | 15 |
| UC-13 | Marcar seção inteira | `applicationFill` | 15 com `ids[]` |
| UC-14 | Status de trabalho do item | `applicationFill` | 15 |
| UC-15 | Item avulso | `applicationFill` | 14 |
| UC-16 | Captura contínua de fotos | `photoCapture` | 16 → PUT no R2 → 17 |
| UC-17 | Remover foto | `applicationFill` | 18 |
| UC-18 | Editar tags/data da visita | `applicationFill` | 12 |
| UC-19 | Concluir aplicação | `applicationFill` | 12 com `status: completed` |
| UC-20 | Excluir aplicação | `applicationFill` | 13 |
| UC-21 | Relatório por tags + período | `overview` | 19 |
| UC-22 | Relatório diário (HTML/PDF fica em `reports/`) | CLI | 9 com `from`/`to`/`include` |
| UC-23 | Reordenar itens (DND, nas duas telas) | `checklistEdit`, `applicationFill` | 7 (§4.6) |
| UC-24 | Campo novo sem migração | qualquer | `metadata` no corpo de 6/7/11/12/14/15/17 |

---

## 9. OpenAPI

**Não há `openapi.yaml` no repo.** O `/openapi` é gerado pelo `@elysiajs/swagger` a partir dos
`body`/`query`/`response` TypeBox de cada rota (`RNF-BE-13`) — manter um YAML paralelo é garantir
que os dois divirjam. O `swagger()` recebe só `documentation` (título, versão, descrição, tags):

```ts
swagger({
  path: '/openapi',
  documentation: {
    info: { title: 'Vistoria API', version: '1.0.0',
      description: 'Backend do app de vistoria. Sem autenticação (RNF-BE-01): não exponha publicamente.' },
    tags: [{ name: 'tags' }, { name: 'checklists' }, { name: 'applications' },
           { name: 'attachments' }, { name: 'reports' }],
  },
})
```

Os schemas TypeBox compartilhados (`ListMeta`, `Tag`, `Checklist`, `Application`, `ApplicationItem`,
`Attachment`, `ErrorBody`) ficam em `src/http/schemas.ts` e são referenciados por nome via
`t.Object({...}, { $id: 'Application' })`, para o documento sair com `components/schemas` em vez de
tudo inline. Os exemplos do §10 são o contrato de fato durante a implementação.

---

## 10. Exemplos de views

### 10.1 `home` — Biblioteca · `GET /checklists?page=1&pageSize=25`

```json
{
  "data": [
    {
      "id": "seed-checklist-apartamentos",
      "title": "Vistoria de apartamentos",
      "source": "manual",
      "tagsIds": ["tag_apartamentos"],
      "options": [
        { "label": "Sim", "semantic": "positivo" },
        { "label": "Não", "semantic": "negativo" },
        { "label": "Parcial", "semantic": "neutro" }
      ],
      "items": [{ "id": "citem_001", "position": 0, "title": "Base shaft: Cozinha", "tagsIds": [] }],
      "applicationsCount": 54,
      "completedCount": 31,
      "metadata": {},
      "createdAt": "2026-09-01T12:00:00.000Z",
      "updatedAt": "2026-09-23T18:40:12.000Z",
      "deletedAt": null
    }
  ],
  "meta": { "pagination": { "page": 1, "pageSize": 25, "pageCount": 1, "total": 2 } }
}
```

Renderiza `title` · `"{items.length} itens"` · até 3 labels de tag ·
`"{applicationsCount} aplicações · {completedCount} concluídas"`. Os dois contadores matam a
chamada `applications.listAll` que a tela faz hoje só para contar.

### 10.2 `checklistDetail` — Histórico · `GET /applications?checklistId=…&sort=date:desc`

```json
{
  "data": [
    {
      "id": "application_x1",
      "checklistId": "seed-checklist-apartamentos",
      "tagsIds": ["tag_t1a", "tag_apt83"],
      "date": "2026-09-23T12:00:00.000Z",
      "status": "completed",
      "answeredCount": 30,
      "totalCount": 30,
      "negativeCount": 4,
      "attachmentsCount": 9,
      "completedAt": "2026-09-23T17:12:44.000Z",
      "deletedAt": null
    }
  ],
  "meta": { "pagination": { "page": 1, "pageSize": 25, "pageCount": 3, "total": 54 } }
}
```

O agrupamento por conjunto exato de tags (`RF-07.1`) **fica no cliente** —
`groupApplicationsByTagSet` é apresentação e já funciona. O que o servidor passa a entregar pronto
é `negativeCount` e `answeredCount/totalCount`, hoje calculados carregando todos os itens de todas
as aplicações.

### 10.3 `applicationFill` — Preenchimento · `GET /applications/application_x1`

```json
{
  "data": {
    "id": "application_x1",
    "checklistId": "seed-checklist-apartamentos",
    "tagsIds": ["tag_t1a", "tag_apt83"],
    "date": "2026-09-23T12:00:00.000Z",
    "status": "draft",
    "transcript": null,
    "gallerySourceApplicationId": "application_p0",
    "metadata": {},
    "attachments": [
      {
        "id": "attachment_a",
        "name": "Foto 1758645132",
        "position": 0,
        "storageKey": "applications/application_x1/_gallery/attachment_a.jpg",
        "uploadStatus": "uploaded",
        "url": "https://r2.example.com/…?X-Amz-Expires=3600",
        "sizeBytes": 48211,
        "mimeType": "image/jpeg",
        "width": 400,
        "height": 533,
        "metadata": {},
        "createdAt": "2026-09-23T14:32:12.000Z",
        "deletedAt": null
      }
    ],
    "items": [
      {
        "id": "aitem_03",
        "position": 2,
        "checklistItemId": "citem_003",
        "title": "Ligação hidraulica: Cozinha",
        "description": "",
        "answer": "Não",
        "answeredAt": "2026-09-23T14:20:03.000Z",
        "note": "aguardando registro",
        "quantity": 2,
        "tagsIds": ["tag_jorge"],
        "suggested": false,
        "suggestionSource": null,
        "workflowStatus": "denied",
        "attachments": [],
        "metadata": { "severidade": "alta" },
        "createdAt": "2026-09-23T12:00:00.000Z",
        "updatedAt": "2026-09-23T14:20:03.000Z",
        "deletedAt": null
      }
    ],
    "createdAt": "2026-09-23T12:00:00.000Z",
    "updatedAt": "2026-09-23T14:32:12.000Z",
    "completedAt": null,
    "deletedAt": null
  },
  "meta": {}
}
```

`note`, `quantity`, `description` e `transcript` são colunas — a forma é byte-a-byte a do
`convex/validators.ts`. `metadata` é o único campo novo, e só aparece quando alguém escreveu nele.
A sequência de `items[]` aqui é `ORDER BY position, id` — determinística, mas **não** a ordem de
tela: quem ordena para exibir é `sortItemsByChecklistOrder` no cliente, com o checklist da rota 5
em mãos (§4.6).

Renderiza `"1/30 respondidos · Executando"`, ProgressBar, `"1 anexadas"` na galeria,
`"Galeria da aplicação anterior disponível como referência."` (porque
`gallerySourceApplicationId != null`), seções por prefixo de título, e no row: dot `denied`, label
`negado na revisão`, chips `Jorge da Costa` · nota · `Qtd 2`.

### 10.4 Responder um item · `PATCH /application-items/aitem_03`

```
→  { "answer": "Sim", "updatedAt": "2026-09-23T14:41:00.000Z" }
←  200 { "data": { "id": "aitem_03", "answer": "Sim",
                   "answeredAt": "2026-09-23T14:41:00.000Z", "workflowStatus": null, … } }
```

O item volta aplicado, com `answeredAt` e `workflowStatus` já resolvidos pelas invariantes do §6 —
o `applyLocal` do `ADR/0009` espelha essas mesmas regras, então o overlay sai e o valor do servidor
entra sem divergência. Falha volta como `409`/`422`/`404` na mesma resposta.

### 10.5 `overview` — Relatório · `GET /reports/tags?tagIds=tag_t1a,tag_empreiteiraX&from=…&to=…`

```json
{
  "data": {
    "itemProgress": { "answered": 812, "total": 900 },
    "applicationProgress": { "completed": 24, "total": 30 },
    "pendingGroups": [
      {
        "application": {
          "id": "application_x1",
          "tagsIds": ["tag_t1a", "tag_apt83"],
          "date": "2026-09-23T12:00:00.000Z",
          "status": "draft"
        },
        "items": [{ "itemId": "aitem_07", "itemTitle": "Soleira: WCs" }]
      }
    ]
  },
  "meta": { "pagination": { "page": 1, "pageSize": 25, "pageCount": 1, "total": 6 } }
}
```

Renderiza `90%` + `"812/900 itens respondidos"`, `80%` + `"24/30 aplicações concluídas"`,
`"88 itens em 6 aplicações"`, e os cards de pendência. **É o maior ganho do port** — hoje a tela
puxa a base inteira e filtra em JS.

---

## 11. Layout final

```
apps/vistoria-api/
  drizzle.config.ts
  src/
    index.ts                      Elysia: onError, otel, cors, swagger, controllers, /health
    config.ts  db.ts  otel.ts
    http/error.ts                 mantido do boilerplate
    http/schemas.ts               TypeBox compartilhado (§9)
    lib/{result,pagination,id,env,tx,logger}.ts
    db/{schema.ts,migrations/}
    domain/machines.ts            §6 — três tabelas de transição + invariantes
    storage/r2.ts
    modules/
      tag/           tag.controller.ts  tag.types.ts  repositories/tag.repository.ts
                     create-tag.usecase.ts  list-tags.usecase.ts
      checklist/     checklist.controller.ts  checklist.types.ts
                     repositories/checklist.repository.ts
                     create|update|delete-checklist.usecase.ts  list-checklists.usecase.ts
      application/   application.controller.ts  application.types.ts
                     repositories/application.repository.ts
                     create|patch|delete-application.usecase.ts  patch-item.usecase.ts
                     add-item.usecase.ts  list-applications.usecase.ts
      attachment/    attachment.controller.ts  attachment.types.ts
                     repositories/attachment.repository.ts
                     create-attachments.usecase.ts  confirm-upload.usecase.ts
                     delete-attachment.usecase.ts
      report/        report.controller.ts  tag-report.usecase.ts
  scripts/{import-from-convex.ts,copy-blobs-to-r2.ts,seed-from-xlsx.ts,purge-deleted-blobs.ts}
```

Não há `jobs/` nem `modules/job/` (§5.1), não há `domain/projections.ts` (§1.3) e não há
`openapi.yaml` (§9).

No cliente, o corte **não cria arquivo novo**: muda `lib/offline-queue/{ops,drain,overlay}.ts`,
troca `lib/convex/file-storage.ts` por `lib/uploads/presigned-upload.ts`, e acrescenta uma linha a
`src/FEATURE_FLAG.ts` (§12.4). Tudo o mais em `src/lib/offline-queue/` fica como está.

---

## 12. O corte

### 12.1 O cliente, medido

25 arquivos em `src/` importam `convex`. Mas o acoplamento **não** está espalhado: está em cinco
pontos, e todo o resto da camada offline já é agnóstico.

| Costura | Arquivo | Hoje | Depois |
|---|---|---|---|
| **A. Destino da op** | `src/lib/offline-queue/ops.ts:33` | `mutation: FunctionReference<'mutation'>` no tipo `OpDefinition` | `send: (args) => Promise<unknown>` — uma função por op |
| **B. Executor** | `src/lib/offline-queue/drain.ts:6-9,58` | `MutationRunner` recebe a `FunctionReference` | chama `op.send(item.args)` |
| **C. Leitura** | `src/lib/offline-queue/overlay.ts:59-81` (`useServerOrSnapshot`) | `useQuery` do `convex-helpers`, `useConvexConnectionState`, `castConvex`, `snapshotKey(ref, args)` | `useQuery` do React Query, o sinal da costura E, sem cast, `snapshotKey(path, args)` |
| **D. Upload** | `src/lib/convex/file-storage.ts`, `src/lib/uploads/upload-store.ts:67-113` | `POST` que responde `{ storageId }` | `PUT` presigned, corpo vazio, chave conhecida antes (§4.3) |
| **E. Conectividade** | `src/lib/offline-queue/use-online-status.ts:22` | `useConvexConnectionState().isWebSocketConnected` | `NetInfo.addEventListener` (dependência nova) |

São 13 ops registradas (`tags.create`; `checklists.save`, `softDeleteCascade`; e 10 em
`applications.*`). A costura A é **uma linha por op**.

**A costura E não é decorativa, e o nome do arquivo engana.** `use-online-status.ts` não exporta um
sinal de rede: exporta `useOutboxLifecycle`, e o `isWebSocketConnected` do Convex é a única fonte de
conectividade do app hoje. Ele é load-bearing em dois lugares independentes — o `connected` de
`resolveOverlayBase` (que decide se "nada" é resposta ou espera, ou seja, se a tela abre offline ou
fica em spinner) e o `retryFailedOps()` na reconexão (que é o que desbloqueia uma fila travada no
head). Sem socket, os dois precisam de outra fonte.

**Duas dependências novas entram**, e nenhuma está no `package.json` hoje: `@tanstack/react-query`
e `@react-native-community/netinfo`. Vale instalar as duas no passo 1 do §14 e mover
`useOutboxLifecycle` para NetInfo **enquanto ainda se está no Convex** — assim a troca de
conectividade é validada em campo separada da troca de backend, em vez de as duas falharem juntas
no dia do corte.

**O que não se toca** — e é a maior parte do valor acumulado: `queue.store.ts`, `retry-policy.ts`,
`snapshot.store.ts` (fora a chave), e em `overlay.ts` as funções puras `applyOps`,
`mergePendingIntoList` e `resolveOverlayBase`, mais os 13 `applyLocal`. Nenhuma delas sabe o que é
Convex. Os testes em `src/lib/offline-queue/__tests__/` seguem passando sem edição — é o sinal de
que o corte foi no lugar certo.

**Faça a costura A e B *antes* de existir backend novo.** Trocar `mutation: api.applications.patchItem`
por `send: (args) => convexClient.mutation(api.applications.patchItem, args)` é refactor puro,
mergeável hoje, com o app em produção e o Convex de pé. Depois disso, trocar de backend é trocar o
corpo de 13 funções — não um rewrite.

### 12.2 A única regressão de comportamento: reatividade

`useQuery` do Convex é **push**: o servidor empurra e a tela re-renderiza sozinha. REST não tem
isso. Sem tratar, o sintoma é preciso e feio: a op sai do outbox quando a mutation resolve, o
overlay otimista cai junto, e a tela volta ao último valor lido — o **anterior** à escrita. Pisca
para trás. (`ADR/0009` depende de o valor do servidor estar em mãos no instante em que o overlay
sai.)

Duas metades da solução, as duas obrigatórias:

1. **A mutation devolve o recurso aplicado** — é o que `RF-BE-02` já exige. `drain.ts` passa a
   escrever esse retorno direto no cache do React Query (`setQueryData`) antes de chamar
   `resolve(item.id)`. O overlay sai e o valor do servidor já está lá: nenhuma janela de pisca,
   nenhum refetch.
2. **Invalidação por parentesco** — depois do `setQueryData`, invalidar as listas afetadas
   (`['applications', { checklistId }]`, `['checklists']`) para os contadores agregados
   (`RF-BE-13`, `answeredCount`/`negativeCount` do §10.2) que o servidor calcula e o `applyLocal`
   não sabe recalcular.

O que **não** muda: o overlay continua sendo a fonte da instantaneidade, e `resolveOverlayBase`
continua decidindo offline-vs-loading — só troca a fonte de `connected` (costura E). Uma tela em
modo avião continua abrindo com snapshot + ops pendentes aplicadas, como hoje.

Atenção a uma diferença real entre os dois sinais: `isWebSocketConnected` é "o backend está
respondendo"; NetInfo é "o rádio tem rede". Wi-fi de canteiro com portal cativo é `true` no NetInfo
e inútil na prática. Para o overlay isso é inofensivo (pior caso: a tela espera um instante a mais
antes de assentar); para `retryFailedOps` também, porque a tentativa falha e volta para o backoff.
Não vale construir health-check para cobrir a diferença.

**Uploads em segundo plano continuam intactos**: a fila de `upload-store.ts` nunca dependeu de
reatividade, e o §4.3 preserva a sua independência do outbox. O progresso continua vindo do
`onProgress` do `createUploadTask`, que o presigned PUT também expõe.

### 12.3 Compatibilidade da fila persistida

O outbox persiste `{ type, args }` em disco. Um `type` sobrevive ao corte se o nome **e o formato
dos args** não mudarem. Dos 13, um muda: `applications.setAttachmentUploaded` carrega
`storageId: string`, que vira `storageKey`. Uma op enfileirada antes do corte e drenada depois
falharia — e, por bloquear no head, travaria a fila inteira.

Duas saídas, escolha uma e escreva no ADR:

- **Drenar até zero antes de virar a chave.** O `SyncStatusBar` já mostra a contagem pendente; o
  corte só acontece com ela em 0. Simples, e coerente com a janela de congelamento do §12.5.
- **Aceitar os dois formatos** no `send` de `setAttachmentUploaded` por uma versão
  (`args.storageKey ?? args.storageId`). Custa 1 linha e cobre o aparelho que ficou offline no dia
  do corte — que, com inspeção em campo, é um caso real, não hipotético.

A segunda é a segura. A chave de snapshot também muda (`getFunctionName(ref)` → path da rota), o
que invalida os snapshots em disco: inofensivo, o app refaz o fetch; só não pode ser confundido com
perda de dado quando acontecer.

### 12.4 Ordem do corte

Cada passo é mergeável e deixa o app funcionando. Nenhum exige o seguinte para ter valor.

| # | Passo | Backend em uso | Reversível por |
|---|---|---|---|
| 1 | Costuras A, B e E (`send` no lugar de `FunctionReference`; NetInfo no lugar do socket) | Convex | revert de 1 commit |
| 2 | `bun create elysia apps/vistoria-api`; §2 schema + migration; `domain/machines.ts`; `http/schemas.ts` | Convex | nada em produção depende |
| 3 | Módulos `tag` → `checklist` → `application` → `attachment` → `report`, um por vez, cada um com `controller.test` contra Postgres real | Convex | idem |
| 4 | Importação de dados + conferência (§12.5) | Convex | rodar de novo |
| 5 | Costuras C e D atrás de uma flag em `src/FEATURE_FLAG.ts` (`backend: 'convex' \| 'rest'`) | escolhido pela flag | virar a flag de volta |
| 6 | Congelamento, re-import, virar a flag, monitorar um dia de campo | REST | flag |
| 7 | `git rm` do `convex/` e do `apps/produto-api`; `ADR/0012` | REST | — |

A flag do passo 5 é o que torna o corte reversível **sem redeploy de loja**: o app já carrega
`FEATURE_FLAG.ts`, e as costuras C e D são as duas únicas que precisam olhar para ela.

### 12.5 Dados: importação, blobs, congelamento

1. **Exportar do Convex** — `scripts/import-from-convex.ts` com `ConvexHttpClient` contra
   `checklists:list`, `tags:listAll`, `applications:listAll` (é o que `scripts/vistoria-xlsx.ts` já
   faz), depois `applications:findById` por aplicação para pegar `url` de cada anexo.
2. **Transformar** — explodir `items[]`/`attachments[]` em linhas; `tagsIds` dos 4 níveis em
   `tags_ids`. `note`/`quantity`/`description`/`transcript`/`mimeType`/`width`/`height` caem em
   colunas de mesmo nome — mapeamento 1:1, sem transformação. `checklist.items[]` continua array —
   só troca de JSON do Convex para jsonb do Postgres. `metadata` nasce `{}` em tudo.
3. **Copiar blobs** — `copy-blobs-to-r2.ts`: `GET` na URL do Convex, `PUT` na chave do R2, grava
   `storage_key`. Paralelizar em 6, mesma concorrência do gerador de relatório. **Tem de ser
   retomável e idempotente**: a URL do Convex expira, são ~450 fotos por dia de campo acumuladas, e
   uma queda no meio não pode obrigar a recomeçar. Como a chave é determinística (§4.3), a
   retomada é um `HEAD` antes do `PUT` — pula o que já está lá. Falha individual vai para um log de
   pendências, não aborta o lote.
4. **Conferir** — contagens por tabela vs. export; `answeredCount`/`negativeCount` por aplicação
   iguais antes e depois; o dia 2026-09-23 fechando em 54 unidades e 447 fotos (número conhecido do
   `ADR/0011`).
5. **Importação é idempotente e roda quantas vezes precisar.** Todo `INSERT` é por id do Convex com
   `ON CONFLICT DO NOTHING` (ou `DO UPDATE` quando o `updated_at` do export for mais novo). É o que
   torna o passo 6 possível.

**A janela.** Os passos 1–4 rodam com o Convex vivo e recebendo escrita — logo, o que for
inspecionado durante eles **não está** no Postgres. O corte é:

```
1. anunciar o congelamento (fim do expediente; nenhuma vistoria em campo)
2. conferir SyncStatusBar em 0 nos aparelhos  → §12.3
3. rodar o import de novo (idempotente) → agora o delta do período está dentro
4. conferir o §13
5. virar a flag; Convex fica de pé, em modo leitura, por ~2 semanas
```

**Rollback**: virar a flag de volta. O Convex continua com o dado até o passo 5 do congelamento; o
que foi escrito só no Postgres depois disso precisaria de um `export-to-convex.ts` — que **não vale
escrever**. O que vale é encurtar a janela de exposição: virar a flag no fim de um dia, e ter o
primeiro dia de campo completo como o critério de "não volta mais".

## 13. Verificação

```sh
docker run -d --name vistoria-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17
cd apps/vistoria-api && bun install
bun run drizzle-kit generate && bun run drizzle-kit migrate
bun run scripts/import-from-convex.ts && bun run scripts/copy-blobs-to-r2.ts
bun run dev && curl localhost:3000/health
```

| O que | Como | Esperado |
|---|---|---|
| Nada de `@sst/*` sobrou | `grep -r "@sst/" src` | zero hits |
| Typecheck e lint | `bun run typecheck && bun run lint` | verde |
| OpenAPI nasceu do TypeBox | abrir `/openapi` | todo endpoint com `requestBody` **e** `response` — não lista de rotas |
| Paridade de payload | `GET /applications/:id` vs `applications:findById` no mesmo id | diff só em `storageId`→`storageKey`, no `metadata: {}` novo e no envelope `{data}` |
| `RF-BE-12` correto | `GET /reports/tags` vs `queryApplicationsByTags` nos mesmos dados | mesmos `itemProgress`, `applicationProgress`, mesmas pendências |
| Relatório diário | `cd reports && bun run src/main.ts --date 2026-09-23` apontado à nova API | 54 unidades, 10 andares, 447 fotos, 29 itens |
| Escrita aplica na resposta | `PATCH /application-items/:id` | `200` com o item já contendo `answer` e `answeredAt` |
| Idempotência | `POST /applications` 3× com o mesmo `id` | 1 linha, 3 respostas iguais |
| Base da visita anterior | `buildRepeatedApplication` no cliente → `POST /applications` | itens com `suggested: true`, `suggestionSource: previous_application`, `workflowStatus: null`, `attachments: []`, `gallerySourceApplicationId` preenchido |
| DND persiste | arrastar no `applicationFill` → `PUT /checklists/:id` → refetch das duas telas | ordem nova no modelo **e** em toda aplicação daquele checklist |
| Ordem estável | `GET /applications/:id` 2× sem escrita | mesma sequência de `items[]` nas duas respostas |
| Máquina de estado | `PATCH /attachments/:id` `uploaded` → `pending` | `409 transição ilegal` |
| Alvo ausente | `PATCH /applications/nao-existe` | `404` |
| Soft delete preserva foto | `DELETE /applications/:id`, `HEAD` no objeto | objeto presente |
| Presign funciona no R2 | `POST .../attachments` e `PUT` do binário | `200`; sem `WHEN_REQUIRED` isso falha (§4.3) |
| Campo novo sem migração | `PATCH /application-items/:id` com `{ "metadata": { "severidade": "alta" } }` | volta em `metadata` no `GET`; segundo PATCH com outra chave faz merge, não substitui |
| Paginação | `GET /applications?page=3&pageSize=10` | `meta.pagination` coerente, `total` estável entre páginas |

Testes: `bun run test` (vitest). Um `*.controller.test.ts` por módulo contra Postgres real, mais
unitário para as três máquinas de estado, o merge de `metadata` e o SQL do relatório de tags.

### 13.1 O lado do cliente

O servidor pode estar 100% verde e o corte ainda ser uma regressão. Estas são as verificações que
só existem no aparelho — nenhuma delas é coberta por typecheck.

| O que | Como | Esperado |
|---|---|---|
| Costura no lugar certo | `bun run test src/lib/offline-queue` depois do passo 1 do §14 | verde **sem editar nenhum teste** |
| Nada de `convex` fora das costuras | `grep -rl convex src` | só `ops.ts`, `drain.ts`, `overlay.ts`, `use-online-status.ts`, `file-storage.ts` e os `*.ops.ts` |
| Costura E isolada | depois do passo 1, modo avião → abrir uma vistoria já visitada | abre com snapshot, sem spinner — **com o Convex ainda em uso** |
| Overlay não pisca | responder um item com rede boa, observar o row | valor novo entra e **fica**; nenhum frame com o valor anterior quando a op sai da fila (§12.2) |
| Contadores agregados atualizam | responder um item → voltar para `checklistDetail` | `answeredCount` do card subiu sem pull-to-refresh |
| Modo avião abre | matar o app offline, reabrir, entrar numa vistoria | snapshot + ops pendentes aplicadas; nenhum spinner infinito |
| Criar vistoria offline | modo avião → `applicationNew` → preencher → reconectar | aplicação aparece com os itens montados por `buildRepeatedApplication`, uma única linha no servidor |
| Upload não espera o outbox | travar uma op no head (backend fora do ar para 1 rota) e tirar foto | a foto **sobe** mesmo assim; `setAttachmentUploaded` fica na fila atrás da op travada (§4.3, disclosure 5) |
| Progresso de upload | tirar 10 fotos em sequência no `photoCapture` | barra de progresso por foto, como hoje |
| Fila persistida sobrevive ao corte | enfileirar `setAttachmentUploaded` com a flag em `convex`, virar para `rest`, drenar | op aplica (§12.3) |
| Rollback | virar `FEATURE_FLAG.backend` de volta | app volta a funcionar contra o Convex sem reinstalar |

---

## 14. Próximos passos, em ordem

A ordem é a do §12.4 — o critério é que **cada passo seja mergeável sozinho**, com o app em
produção o tempo inteiro. Nada aqui exige um estado intermediário quebrado.

1. **Costuras A, B e E do cliente** (§12.1): `OpDefinition.mutation` → `send`, `drain.ts` chamando
   `op.send`, e `useOutboxLifecycle` lendo NetInfo em vez do socket do Convex. Tudo isso é refactor
   puro contra o Convex atual, e a costura E precisa de um dia de campo sozinha — é a que decide se
   a tela abre offline. Os testes de `src/lib/offline-queue/__tests__/` têm de passar sem edição —
   se precisarem, o corte foi no lugar errado.
2. **`bun create elysia apps/vistoria-api`** (§3): copiar `http/error.ts`, `lib/logger.ts`, o
   `onError`/OTel/cors de `index.ts` e a linha `WHEN_REQUIRED` do `s3.ts`. `apps/produto-api` fica
   como referência de leitura, intocado.
3. **`src/db/schema.ts` + primeira migration** (§2), com `server_updated_at` nos filhos.
4. **`domain/machines.ts`** (~60 linhas, §6) **+ `http/schemas.ts`** (§9). São as duas peças que
   todo módulo depois consome — e as únicas com teste unitário de verdade.
5. **Módulos, um por vez**, cada um fechando com um `controller.test` contra Postgres real:
   `tag` → `checklist` → `application` → `attachment`. A ordem é a de dependência.
6. **`report/`** — o SQL do `RF-BE-12`. É o maior ganho do port (§10.5) e o único lugar onde vale
   teste unitário de SQL.
7. **`POST /uploads/presign`** (§4.3) e o `storage/r2.ts`. Verificar o presigned PUT contra o R2
   real antes de tocar no cliente — é o passo que falha em silêncio sem `WHEN_REQUIRED`.
8. **Scripts de migração** (§12.5), com o `copy-blobs-to-r2.ts` retomável, e a conferência do §13
   rodando contra os dois backends.
9. **Costuras C e D atrás de `FEATURE_FLAG.backend`** (§12.1, §12.2): React Query no
   `useServerOrSnapshot`, `setQueryData` no drain, invalidação por parentesco, e o upload em PUT
   presigned. É o passo que precisa de aparelho — não confie só em typecheck.
10. **O congelamento e a virada** (§12.5), no fim de um expediente, com `SyncStatusBar` em 0.
11. **`ADR/0012-postgres-backend.md`**: a regra coluna-vs-`metadata` (§1), por que não há fila
    (§5.1), o que foi rejeitado (§1.4, §2.0), e a decisão de compatibilidade da fila persistida
    (§12.3).
12. **`git rm convex/ apps/produto-api/`** — só depois de um dia de campo completo em REST.
