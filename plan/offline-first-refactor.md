# Refatoração offline-first + arquitetura feature-first + skill

## Context

O app já é rápido de olhar, mas a velocidade é frágil: ela depende de o cliente Convex estar vivo
e conectado. Três fatos concretos do repositório hoje:

1. **Nada sobrevive ao kill do app.** `withOptimisticUpdate` (`src/hooks/useApplicationMutations.ts`)
   vive só na memória do `ConvexReactClient`; a fila de mutations do Convex também é
   [in-memory](https://docs.convex.dev/client/react) — ela reenvia offline, mas morre com o processo.
   O rascunho do `ApplicationFill` é `useState` (`itemEdits`), e o `local-answers-store.ts`
   (único buffer com retry que o app já teve) está sendo deletado no working tree atual.
   Uma vistoria de 40 itens preenchida no subsolo some se o iOS matar o app.

2. **Foto tirada offline não existe.** `upload-store.resumePending()` redescobre trabalho perdido
   consultando `api.applications.listAll` — ou seja, **precisa de rede para saber que tem trabalho
   offline**. Se `addAttachment` nunca chegou ao servidor, não existe linha `uploadStatus: 'pending'`,
   e o arquivo em `documentDirectory/uploads/` vira órfão para sempre.

3. **Dois estilos de escrita convivem.** Telas de application usam mutations otimistas granulares;
   telas de checklist usam `src/infra/services/checklist-service.ts` → repositório imperativo →
   `await` bloqueante, sem optimistic, sem retry. E `src/app/ApplicationFill/index.tsx` tem
   **917 linhas, 11 `useState`, 3 `useForm`** e duas políticas de persistência lado a lado
   (respostas em lote no botão; tags/data/transcript imediatos).

Além disso, `src/infra/` carrega peso morto verificado: três `AsyncStorage*Repository` completos que
**nunca são instanciados**, ~18 funções async em `application-service.ts` que chamam
`repo.save()` → `api.applications.create` (que ignora doc existente, ou seja, **silenciosamente não
fazem nada**), e `src/infra/domain/repositories/` cuja interface (`save(entidadeInteira)`) não bate
com as mutations granulares que a UI realmente usa.

**Resultado esperado:** um único caminho de escrita durável para o app inteiro, uma estrutura de
pasta repetível por feature, e uma skill que aplica e audita esse padrão em telas novas.

**Decisões já tomadas** (confirmadas nesta conversa):
- Estrutura **feature-first** completa; `src/app/*` vira rota fina.
- **Auto-save na fila**, sem botão salvar e sem sheet de descartar — nada se perde, então não há o
  que confirmar. `useUnsavedChangesGuard` é aposentado.
- **Outbox persistido** em AsyncStorage, idempotente pelo `id` externo.
- Skill em `.agents/skills/`, em pt-BR, no estilo do `mobile-ux-skill` autoral.

---

## As cinco primitivas

A regra de simplicidade deste plano: **nada além destas cinco peças**. Toda tela nova é composição
delas. Se uma tela precisa de uma sexta, ou a peça é genérica (entra em `lib/`) ou a tela está errada.

| # | Primitiva | Arquivo | O que resolve |
|---|---|---|---|
| 1 | `defineOp` | `src/lib/offline-queue/ops.ts` | Uma escrita = `{ mutation, applyLocal }`. O mesmo `applyLocal` serve de overlay e espelha o handler do Convex |
| 2 | `outbox` | `src/lib/offline-queue/queue.store.ts` | Fila FIFO persistida. Único caminho para a rede |
| 3 | `useEntity` / `useEntityList` | `src/lib/offline-queue/overlay.ts` | `useQuery` + ops pendentes aplicadas por cima. É o que faz o app ser instantâneo e sobreviver ao restart |
| 4 | `useDraft` | `src/lib/forms/use-draft.ts` | RHF + zod + rascunho persistido, para o que ainda não virou entidade |
| 5 | `*.container.ts` + `*.view.tsx` | convenção de pasta | Container é um **hook** (`useXContainer`, sem JSX); a view é o **único componente**, chama o hook direto e renderiza a partir do retorno — sem interface de props espelhando o container à mão |

### Por que trocar `withOptimisticUpdate` pelo overlay da fila

Esta é **a** decisão de arquitetura do plano, e ela é o que apaga complexidade em vez de somar.

`withOptimisticUpdate` aplica o patch e o descarta quando *aquela* mutation resolve. Se a escrita
vai para uma fila e sai depois, não há mutation em voo para segurar o overlay — e num restart o
overlay já morreu junto com o processo. Manter os dois mecanismos significa duas fontes de verdade
para "o que está pendente".

Então: **a fila é a fonte de verdade do pendente**, e a leitura aplica os ops pendentes sobre o
resultado do `useQuery`. Uma entrada sai da fila **só quando a mutation resolve** — e o contrato do
Convex é que `await mutation(...)` resolve depois do commit *e* depois de as queries do cliente
terem sido atualizadas, então a troca overlay→servidor acontece sem piscar.

O que isso apaga:
- `useOptimisticMutation` e a dança do `updateRef` (`useApplicationMutations.ts:180-196`).
- `patchAppEverywhere` / `seedApplicationEverywhere` e os 5 helpers de attachment (~180 linhas):
  viram **um** `applyOps(entity, ops)` sobre o resultado da query.
- O `exit` flag + efeito do `ApplicationFill` (`:141-153`) que só existe para conseguir sair de uma
  tela suja.
- `useUnsavedChangesGuard` + os 3 blocos de `ConfirmBottomSheet` copiados.

O que já existe no repo e vira reuso direto:
- `applyItemEdits` (`src/app/ApplicationFill/itemEdits.ts`) — já é exatamente um `applyLocal`,
  inclusive preservando identidade de objeto para os itens não tocados (obrigatório pela ADR 0008).
- `applyApplicationItemPatch` (`src/infra/services/application-service.ts`) — já é compartilhado
  entre cliente e servidor. Continua sendo a regra única de merge de item.
- `normalizeApplication` (`src/infra/convex/normalize.ts`) — inalterado.

---

## Estrutura alvo

```text
src/
├── app/                                  # SÓ rotas: cada arquivo renderiza a view
│   ├── ApplicationFill.tsx               #   export default () => <ApplicationFillView .../>
│   └── …
├── features/
│   ├── application/
│   │   ├── application-fill/
│   │   │   ├── index.ts                  # exporta só a view
│   │   │   ├── application-fill.container.ts   # hook useApplicationFillContainer — sem JSX
│   │   │   ├── application-fill.view.tsx       # único componente; chama o hook e renderiza
│   │   │   ├── application-fill.schema.ts
│   │   │   └── components/               # ← move de src/app/ApplicationFill/components/
│   │   ├── application-new/
│   │   ├── photo-capture/
│   │   └── shared/
│   │       ├── application.types.ts      # ← infra/domain/entities/application.ts
│   │       ├── application.utils.ts      # ← as funções PURAS de application-service.ts
│   │       └── application.ops.ts        # ← defineOp por mutation
│   ├── checklist/
│   │   ├── checklist-form/               # usado por New e Edit (já compartilham a view hoje)
│   │   ├── checklist-library/
│   │   ├── checklist-detail/
│   │   └── shared/{types,utils,ops,templates}.ts
│   ├── report/  └── report-overview/ + shared/
│   └── tag/     └── shared/{types,utils,ops}.ts
├── lib/
│   ├── offline-queue/
│   │   ├── queue.store.ts                # zustand + persist(AsyncStorage)
│   │   ├── ops.ts                        # defineOp + registry
│   │   ├── overlay.ts                    # useEntity / useEntityList / applyOps
│   │   ├── process-queue.ts              # dreno serial
│   │   ├── use-online-status.ts          # useConvexConnectionState + AppState
│   │   ├── retry-policy.ts
│   │   └── index.ts
│   ├── forms/
│   │   ├── use-draft.ts                  # RHF + zod + rascunho persistido
│   │   └── draft.store.ts
│   ├── convex/                           # ← infra/convex/ (client, normalize, file-storage, photo-picker)
│   ├── uploads/                          # ← infra/uploads/
│   ├── storage/local-collection.ts       # ← infra/storage/local-collection.ts
│   └── id.ts                             # ← infra/id.ts
├── components/  routes/  styles/  utils/ # inalterados
└── (src/infra/ e src/hooks/ deixam de existir)
```

**Deletar** (verificado como morto): `src/infra/domain/repositories/`, `src/infra/storage/async-storage-*-repository.ts`,
`src/infra/storage/index.ts` (`clearAllData` nunca é chamado), `src/infra/convex/*-repository.ts`,
`src/infra/data/seed.ts`, `src/components/TranscriptSuggestionPanel/` (pasta vazia),
`src/hooks/checklist.md`, `src/hooks/seed de tags.md`, e as ~18 funções async de
`application-service.ts` que chamam `repo.save`.

**Mover para fora do caminho crítico:** `migrateLocalDataToConvex()` hoje trava a splash em
`App.tsx` e mostra `StartupError` num primeiro boot sem rede. Vai para `lib/legacy/`, roda
*depois* do render (sem gatekeeping) e falha em silêncio — o outbox cobre o retry.

---

## Fases

Cada fase deixa o app compilando e rodando. Rodar `bun run typecheck && bun run lint` no fim de cada uma.

### Fase 0 — Fechar o working tree

O tree atual tem mudanças em voo (`itemEdits.ts` novo, `local-answers-store.ts` deletado,
`useUnsavedChangesGuard` reescrito para `usePreventRemove`). Commitar como está antes de começar —
metade disso é substituído nas fases 4-5 e o diff precisa ser legível.

### Fase 1 — Convex: idempotência e ordem

`convex/applications.ts` tem duas mutations que **duplicam em replay** — e replay passa a ser normal
quando a fila persiste entre sessões:

- `addItem` — hoje `items: [...items, item]` incondicional. Passa a `if (items.some(i => i.id === item.id)) return null`.
- `addAttachment` — mesmo problema, mesma correção por `attachment.id`.

Tudo o mais já é idempotente por construção: `create` é insert-if-absent, os `patch*` são
last-write-wins por campo com merge per-item, `purgeAttachment` e `setAttachment*` mapeiam por id,
`tags.create` deduplica por `normalizedLabel`, `checklists.save` é upsert real.

**Não é preciso `clientId` nem índice novo** — as três tabelas já têm `id` gerado no cliente com
`by_external_id` (`convex/schema.ts`). O `id` externo *é* a chave de idempotência.

Ordem: o dreno é FIFO global e serial, então `create` sempre chega antes dos `patch*` da mesma
entidade. Sem isso, `patchItems` faz `if (!application) return null` e a escrita evapora em silêncio.

### Fase 2 — `lib/offline-queue`

`ops.ts` — o registry. Uma escrita se declara em um lugar só:

```ts
export const patchItems = defineOp('applications.patchItems', {
  mutation: api.applications.patchItems,
  // o MESMO merge que o handler do Convex faz — reusa applyApplicationItemPatch
  applyLocal: (app: Application, args) =>
    args.patches.reduce((a, p) =>
      applyApplicationItemPatch(a, p.itemId, p.patch, args.updatedAt), app),
  entityId: (args) => args.applicationId,
})
```

`queue.store.ts` — zustand com `persist` e `createJSONStorage(() => AsyncStorage)`, chave
`@vistoria/outbox`. Item: `{ id, type, args, entityId, attempts, enqueuedAt }`.
Ações: `enqueue`, `resolve(id)`, `fail(id)`. Prior art de dedupe/concorrência/recovery:
`src/infra/uploads/upload-store.ts`.

`overlay.ts` — o coração da leitura:

```ts
export function useEntity<T>(query, args, entityId) {
  const server = useQuery(query, args)
  const pending = useOutbox((s) => s.itemsFor(entityId))   // selector com shallow
  return useMemo(() => (server ? applyOps(server, pending) : null), [server, pending])
}
```
`useEntityList` faz o mesmo e ainda **anexa entidades criadas que o servidor ainda não tem**
(op `create` pendente) — sem isso, uma vistoria criada offline não aparece na Library, que é
justamente onde a sensação de velocidade quebra.

`process-queue.ts` — dreno serial: pega o primeiro item, `await convexClient.mutation(...)`,
`resolve(id)` no sucesso; no erro `fail(id)` e para o dreno (FIFO tem que manter ordem — não pular
o item que falhou). Reagenda com o backoff de `retry-policy.ts` (exponencial com jitter,
`MAX_ATTEMPTS`). Item que estoura tentativas fica marcado `failed` e **não é descartado**.

`use-online-status.ts` — sem dependência nova: `useConvexConnectionState()` do `convex/react`
(já usado por `SyncStatusBar` e `Screen`) + `AppState` `'active'`. Dispara o dreno na volta da
conexão, no foreground e no boot.

Testes (Bun tem runner embutido, `bun-types` já está no projeto — zero dependência nova):
`applyOps`, os `applyLocal` de cada op contra o handler equivalente, e a ordem/backoff do dreno.
São funções puras; é o único ponto do app onde teste paga o custo hoje.

### Fase 3 — `lib/forms`

`use-draft.ts` — `useForm` + `zodResolver` + persistência do rascunho:

```ts
const { form, commit } = useDraft({
  key: `checklist:${draftId}`,   // AsyncStorage; sobrevive ao kill
  schema: checklistFormSchema,
  defaultValues,
  onCommit: (values) => enqueue(checklistOps.save(...)),  // debounce
})
```
Duas naturezas, um hook:
- **Entidade já existe** → cada mudança válida faz debounce e enfileira. Sem botão.
- **Entidade ainda não existe** (ChecklistNew) → o rascunho fica no draft store até a ação primária
  ("Criar"), que enfileira o `create`. Nada se perde no meio: voltar e reabrir restaura o rascunho.

Dois detalhes que o repo já aprendeu e que o hook precisa carregar (de `plan/react-hook-form-forms.md`):
`handleSubmit(onSave, () => haptics.error())` — sem o segundo callback o feedback háptico de erro
some silenciosamente; e `useFieldArray({ keyName: 'key' })`, porque `id` já é o id persistido do item.

### Fase 4 — Feature piloto: `checklist-form`

Uma feature inteira no padrão novo, de ponta a ponta, antes de replicar. É a mais simples com
formulário de verdade e já tem o split view/container feito (`ChecklistFormView` é a única "view"
do codebase hoje).

- `features/checklist/checklist-form/` com container + view + schema + `components/`.
- `ChecklistNew` e `ChecklistEdit` (~60 linhas duplicadas cada, `ChecklistEdit` importa o `styles`
  do `ChecklistNew`) colapsam em **um** container parametrizado por `checklistId?: string`.
- `ChecklistFormView` deixa de ter `useForm` próprio, `itemSheet`/`pendingDelete` state e chamadas
  ao undo-toast — isso sobe para o container. A view passa a receber só props.
- `checklist-service.ts` → `checklist.ops.ts`. `softDeleteChecklist` hoje faz N+1 mutations sem
  transação (lista applications → soft-delete cada uma → soft-delete o checklist): vira **uma**
  mutation `checklists.softDeleteCascade` no Convex, enfileirável como um op só.
- Mantém `src/app/ChecklistNew/index.tsx` e `ChecklistEdit/index.tsx` como rotas finas.

**Gate da fase:** typecheck + lint + o roteiro manual de verificação abaixo, rodado nesta feature.
Só replicar depois que passar.

### Fase 5 — `application-fill` (o grande)

O arquivo de 917 linhas quebra assim:

| Peça | Vai para |
|---|---|
| 11 `useState` + derivações + handlers | `application-fill.container.tsx` |
| JSX + sheets | `application-fill.view.tsx` |
| `itemEdits.ts` | dissolve — `applyItemEdits` vira o `applyLocal` de `patchItems` |
| 3 `useForm` de sheet | `hooks/use-item-draft.ts`, `use-meta-draft.ts`, `use-new-item.ts` via `useDraft` |
| fotos | `hooks/use-attach-photos.ts` (move de `src/hooks/`, já é container-like) |
| `components/` | move como está |

Mudanças de comportamento:
- Toque em chip de resposta → `applyLocal` na hora + enfileira com debounce. Sem botão salvar.
- "Concluir aplicação" deixa de ser o momento do flush e passa a ser só `updateMeta({status:'completed'})`.
- O `exit` flag e o `ConfirmBottomSheet` de descartar saem.

**Restrições das ADRs que o split não pode violar** — elas existem porque cada uma já quebrou uma vez:
- **0005**: `expandedGroupIds` **não** volta para o container. Fica na section. Se o container
  precisar disso, é por store com selector por section, não `useState` na raiz.
- **0004**: `useReorderablePanGesture()` continua sendo chamado dentro de cada lista, uma instância
  por lista.
- **0003**: nada de desmontar conteúdo colapsado.
- **0008**: props da view por chave (`onEdit: (id) => void`), sem closure por linha, sem objeto
  literal inline, e o `arePropsEqual` com `shallow` do `ApplicationItemGroupSection` permanece.

### Correção pós-Fase 5 — container é hook, não componente

As Fases 4 e 5 acima, como implementadas, usaram **dois componentes**: um container que computava
tudo e renderizava `<XView {...25 props} />`, e uma view recebendo tudo por uma interface de props
espelhando o container à mão. Correção do usuário: "containers can be only a custom hook
(x.container.ts) only components and the view should be .tsx we're abusing of prop and doing too
much prop drilling." Essa interface era pura cerimônia — o único papel do container era entregar
o próprio estado para um único chamador.

Aplicado retroativamente às duas features e daqui para frente é o padrão:
- `*.container.ts` — **hook** (`useXContainer`), sem JSX, sem componente. Retorna um objeto simples
  de estado + handlers.
- `*.view.tsx` — **único componente** da feature. Chama o hook direto e renderiza a partir do
  retorno — inclusive o chrome do `Screen` (header/footer) e o gate de loading, que antes viviam
  no componente container.
- Rotas (`src/app/X.tsx`) renderizam a view direto, só com o que uma rota realmente tem (ids,
  `navigation`) — não a superfície de props antiga da view.

Uma consequência real: um hook não pode pular sua própria chamada de hook condicionalmente, então
`useDraft` (e qualquer outro hook) tem que ser chamado **sempre**, mesmo durante o loading — o
truque de dois componentes (um componente-gate fora, um componente-pronto dentro) que antes permitia
só montar o formulário depois dos dados carregarem não existe mais. Duas soluções, dependendo do
caso:
- Quando o `defaultValues` do `useDraft` depende do dado assíncrono (caso do `checklist-form`): o
  `useDraft` ganhou `hasPersistedDraft` (verdadeiro só quando a hidratação achou e aplicou um
  rascunho real, não só quando terminou de checar) — um efeito de "resetar para o dado fresco do
  servidor" no container pode então esperar por `hydrated && !hasPersistedDraft` antes de resetar,
  correto independente de qual leitura assíncrona (AsyncStorage ou a query) resolve primeiro.
- Quando o `defaultValues` é estático e só é preenchido depois por um reset ligado a uma ação do
  usuário (caso dos 3 `useDraft` do `application-fill` — nenhum depende do dado carregar): basta um
  `EMPTY_CHECKLIST`/`EMPTY_APPLICATION` de fallback, para todo `useMemo`/`useCallback` seguinte
  continuar type-safe enquanto `loading` é verdadeiro.

Salvo como preferência permanente em `memory/feedback_container-as-hook.md`.

### Fase 6 — Fotos offline de verdade

O buraco: foto tirada offline não gera linha pendente no servidor, então `resumePending()` nunca a
encontra. Correção em duas linhas de raciocínio:

1. `addAttachment` passa pelo outbox (persistido) → a intenção sobrevive ao kill mesmo sem rede.
2. `useUploadStore` ganha `persist` da lista de jobs. O arquivo já está em
   `documentDirectory/uploads/` (`prepareAsset` já faz isso — é durável). `resumePending()` passa a
   unir **duas** fontes: a fila local persistida e a varredura do servidor (`uploadStatus: 'pending'`),
   deduplicando pelo `attachment.id` — que já é a chave de dedupe usada hoje.

Manter intactas as invariantes de `plan/galeria-captura-continua.md`: concorrência 3, backoff,
recovery no `AppState`, purge no `UndoToast.onCommit`, e o `abandoned` que apaga o blob se o upload
chegar depois do cancelamento.

`SyncStatusBar` passa a ler as três fontes (conexão, outbox pendente/falho, uploads em voo) em vez
de só `useConvexConnectionState`. É o único indicador de "ainda não sincronizou" do app.

### Fase 7 — Replicar e limpar

Replicar o padrão em `checklist-library`, `checklist-detail`, `application-new`, `photo-capture`,
`report-overview`, guiado pela auditoria da skill. Depois:

- Deletar `src/infra/` e `src/hooks/` (vazias a essa altura).
- `ApplicationNew` e o `useForm` de batch-tag do `ChecklistDetail` ganham rascunho persistido —
  hoje são os dois formulários sem nenhuma proteção.
- `PhotoCapture` troca o `discardVisible` bespoke pelo padrão.
- Atualizar `README.md` (descreve um app de orçamentos, outra stack e uma pasta `src/data/` que não
  existe) e escrever `ADR/0009-fila-offline-como-unico-caminho-de-escrita.md`.
- Remover o PNG de 207 KB commitado na raiz com o nome `-` (redirect errado) e `reports/.DS_Store`.

### Fase 8 — A skill

`.agents/skills/offline-first-form/` — pt-BR, mesmo tom do `mobile-ux-skill` (autoral, fora do
`skills-lock.json`), e **declarando explicitamente a stack real** (React Navigation + Convex),
porque as skills vendoradas assumem Expo Router + TanStack Query e vão enganar o agente.

```text
.agents/skills/offline-first-form/
├── SKILL.md
└── templates/
    ├── feature.container.ts.md
    ├── feature.view.tsx.md
    ├── feature.ops.ts.md
    └── feature.schema.ts.md
```

`SKILL.md` carrega:
1. **As 5 regras** — nenhuma ação espera o backend; toda escrita é um `defineOp` com `applyLocal`
   que espelha o handler; leitura é sempre `useEntity`/`useEntityList`, nunca `useQuery` cru numa
   tela; rascunho de entidade inexistente vive no draft store; mutation do Convex idempotente pelo
   `id` externo.
2. **A árvore esperada** da feature.
3. **A auditoria** — lista de arquivos obrigatórios e o que significa cada ausência. Um agente
   consegue rodar isso sem ler o código.
4. **As armadilhas já pagas**: `handleSubmit` sem o callback de erro come o `haptics.error()`;
   `keyName: 'key'` no `useFieldArray`; overlay tem que preservar identidade de objeto (ADR 0008);
   `usePreventRemove` em vez de `beforeRemove` se algum dia voltar a existir um guard.
5. **Link para as ADRs 0003-0005 e 0008** como restrições não-negociáveis.

---

## Verificação

Não há framework de teste no projeto. O gate é:

**Automático**
```bash
bun run typecheck      # tsc --noEmit
bun run lint           # biome
bun test src/lib       # novo, só as funções puras da fila (runner do Bun, sem dep nova)
```

**Manual, em device** (o roteiro que prova a tese — rodar na Fase 4 e de novo na Fase 7):

1. **Modo avião durante o preenchimento.** Ativar o avião, responder 10 itens, escrever notas,
   tirar 3 fotos, sair da tela, navegar pelo app. Tudo deve responder no frame seguinte. A Library
   mostra a vistoria com badge de pendente.
2. **Kill offline.** Ainda no avião, matar o app pelo switcher. Reabrir. **Todas** as respostas,
   notas e fotos continuam na tela. É este passo que hoje falha.
3. **Volta da conexão.** Desligar o avião sem tocar em nada. O `SyncStatusBar` acende, a fila drena,
   o badge de pendente some sozinho. Nenhum item duplicado (verificar contagem de fotos e de itens
   — é exatamente o que a Fase 1 protege).
4. **Replay forçado.** Com a fila cheia, matar o app no meio do dreno e reabrir conectado.
   Nenhuma duplicata. Confirma a idempotência de `addItem`/`addAttachment`.
5. **Criação offline.** Criar um checklist e uma vistoria inteiros no avião. Ambos aparecem nas
   listas. Ao reconectar, chegam ao servidor na ordem certa (`create` antes dos `patch`).
6. **Sem regressão de interação** (as ADRs): drag-and-drop funciona nos dois lados, grupo com 12+
   itens abre numa passada só, confirmar item ainda anima a descida para o fim do grupo.
7. **Primeiro boot offline.** App novo, sem rede: abre na Library vazia em vez do `StartupError`.

**Rollback:** cada fase é um commit. As Fases 1-3 são aditivas (não removem caminho existente), então
o ponto de não-retorno real é a Fase 4.

---

## Arquivos críticos

| Arquivo | O que acontece |
|---|---|
| `src/app/ApplicationFill/index.tsx` (917) | quebra em container/view/hooks — maior risco do plano |
| `src/hooks/useApplicationMutations.ts` (343) | ~180 linhas de helpers de optimistic viram `applyOps` |
| `src/infra/services/application-service.ts` (655) | puras → `application.utils.ts`; ~18 async mortas → deletadas |
| `src/infra/services/checklist-service.ts` (204) | → `checklist.ops.ts`; o cascade N+1 vira uma mutation |
| `src/app/ApplicationFill/itemEdits.ts` | dissolve em `applyLocal` de `patchItems` |
| `src/infra/uploads/upload-store.ts` (220) | ganha `persist` + segunda fonte no `resumePending` |
| `convex/applications.ts` | `addItem` e `addAttachment` idempotentes; `softDeleteCascade` novo |
| `src/hooks/useUnsavedChangesGuard.ts` | deletado (auto-save torna o guard desnecessário) |
| `src/infra/{domain/repositories,storage/async-storage-*,convex/*-repository}` | deletados (mortos) |
| `App.tsx` | migração sai da splash; `SyncStatusBar` passa a ler a fila |

---

## Premissa declarada

Você escolheu "auto-save na fila, sem botão salvar" de forma global. Isso é direto para o que **já
existe** (fill, edit), mas formulários de **criação** não têm entidade para salvar ainda. A leitura
que este plano adota: o rascunho de criação fica no draft store persistido e a entidade nasce na
ação primária que já existe hoje ("Criar checklist" / "Iniciar vistoria") — que é navegação, não um
botão salvar. Resultado prático é o mesmo que você pediu: nada se perde, nenhum sheet de descartar,
e a Library não enche de checklists vazios. Se você preferir criar a entidade já no primeiro
caractere válido, é uma linha no `useDraft` — diga e eu troco.

---

## Estado da execução — 2026-09-21

O plano está executado de ponta a ponta. `src/infra/` e `src/hooks/` não existem mais.
`bun run typecheck && bun run lint && bun test src` passam limpos (33 testes).

### Quatro defeitos encontrados no que as Fases 1-5 já tinham entregue

Auditoria do código contra o plano. Todos corrigidos aqui.

1. **`useOutboxLifecycle` era código morto.** Definido e exportado, nunca montado — `App.tsx` não o
   chamava. O único gatilho de dreno era o próprio `enqueueOp`, então uma fila persistida não
   drenava no boot, nem na reconexão, nem no foreground: o usuário reabria o app conectado e nada
   subia até fazer uma escrita nova. Agora é montado dentro do `ConvexProvider`, e a hidratação
   assíncrona do `persist` também dispara o dreno (`onFinishHydration`) — sem isso, a montagem
   acontece com a fila ainda vazia e perde tudo o que estava em disco.

2. **`applications.create` não passava pela fila.** `ApplicationNew` e `ChecklistDetail` ainda usavam
   `useApplicationMutations` (in-memory). Isso era pior do que não ter migrado: os `patchItem` /
   `addAttachment` *estavam* persistidos, mas apontavam para uma entidade que o servidor nunca ia
   receber — no kill offline o `create` sumia, os patches drenavam, e cada handler batia no
   `if (!application) return null`. As respostas evaporavam em silêncio, que é exatamente o Fato 1 do
   contexto acima.

3. **`useEntityList` injetava entidade de tipo errado.** Toda op cujo `entityId` não estava na lista
   era tratada como "criada" e anexada, sem checar de que op se tratava. Como
   `checklistSave.applyLocal` retorna `args.entity` ignorando o que recebe, uma edição de checklist
   pendente virava um Checklist injetado na lista de Applications da Library. `defineOp` ganhou
   `kind`, e o overlay filtra por ele; listas já filtradas pelo servidor (`listByChecklistId`) ganham
   um predicado `belongs`.

4. **Op `failed` era pulada, não bloqueava a fila.** O dreno filtrava `status === 'pending'`, então um
   item que estourava `MAX_ATTEMPTS` era marcado e os seguintes passavam por cima — o oposto do FIFO
   que o próprio comentário prometia. E nada nunca retentava um `failed`, enquanto o overlay
   continuava aplicando ele para sempre: a tela mostrava dado que jamais sincronizaria, sem sinal
   nenhum. Agora o dreno é `items[0]` estrito, um head `failed` **bloqueia**, `retryFailed()` roda em
   reconexão/foreground/boot, e a `SyncStatusBar` fica vermelha enquanto durar.

### Desvios em relação ao plano escrito

- **`setTagsForMany` não virou op.** Um op tem exatamente um `entityId`; o batch-tag do
  `ChecklistDetail` enfileira N `updateMeta` (um por aplicação), que é o que permite o overlay pintar
  cada linha. Custa N round trips para um punhado de aplicações e drena em ordem.
- **`reorderChecklistItems` sobreviveu, como função pura.** Era `repo.findById` + `repo.save`
  bloqueante chamado do `ApplicationItemGroupSection`; virou transformação pura sobre o checklist que
  a section já tem em mãos, enfileirada como `checklists.save`.
- **`tags.create` entrou na fila** (não estava no plano). Aplicar um modelo de checklist faz
  `await createTag` por label — sem rede isso travava para sempre. `createTag` agora resolve assim que
  enfileira e deduplica localmente por `normalizedLabel`, espelhando o servidor.
- **`setAttachmentUploaded` / `setAttachmentUploadStatus` também entraram na fila.** O upload pode
  terminar segundos antes de um kill; perder essa escrita deixa uma foto guardada no servidor que o
  app re-envia para sempre.
- **A fila de upload guarda o job enquanto ele roda.** O `drainQueue` antigo removia o job de `queue`
  *antes* de processar, então um kill no meio do upload perdia a única referência ao arquivo local. O
  `resumePending` passou a unir fila persistida + varredura do servidor, pulando anexos que já têm
  `storageId` ou um `setAttachmentUploaded` pendente na outbox (o arquivo local já foi apagado nesse
  ponto — re-enviar só marcaria a foto como falha).
- **`getOp` devolve `undefined` em vez de lançar.** Ele roda durante o render do overlay; uma op
  persistida por um build que não a define mais não pode derrubar a tela. O dreno trata o mesmo caso
  como falha permanente, que fica visível.
- **`src/features/ops.ts` registra todas as ops no boot.** Antes o registro dependia de as rotas
  serem importadas estaticamente — funcionava por acidente, e quebraria na primeira rota lazy.
- **PhotoCapture perdeu o `ConfirmBottomSheet` de descartar** (o plano pedia "o padrão"): nada se
  perde ao sair da câmera, então não há o que confirmar.
- **`reports/` foi consertado, não excluído do typecheck.** Eram 13 erros reais num projeto Bun
  separado: `loadEnv` devolvendo `Record<string,string>`, `client.query` com string em vez de
  `makeFunctionReference`, e dois campos (`position`, `deletedAt`) faltando nas interfaces locais.

### O que continua pendente

**O roteiro manual de 7 passos nunca foi rodado em device.** Ele é a única coisa que prova a tese —
modo avião → kill → reabrir → reconectar, sem duplicata e sem perda. Os passos 2, 4 e 5 cobrem
caminhos sem nenhum teste automatizado. Nada aqui foi executado em aparelho.

### Quinto defeito, achado em device — modo avião mostrava tela vazia

Reportado rodando o app: com o avião ligado, nada aparece.

A causa é a premissa que o overlay carregava desde a Fase 2: ele só sabia aplicar ops **em cima de
uma resposta do `useQuery`**, e tratava `undefined` como "ainda carregando". Só que `useQuery` só
resolve quando o socket resolve — sem rede ele fica `undefined` para sempre. Resultado: toda tela
num spinner permanente, com a fila cheia de dados que ninguém conseguia ler.

E havia um buraco atrás dele: a fila guarda **escritas pendentes**, não entidades. O cache de query
do Convex vive só na memória do cliente. Então mesmo consertando o gate, uma vistoria criada
*online* não tinha nenhuma cópia local depois de um kill — o passo 2 do roteiro ("todas as
respostas continuam na tela") não tinha como passar.

Correção em duas partes:

- **`snapshot.store.ts`** — a última resposta de cada query é persistida em AsyncStorage, uma chave
  por `query(args)`, com debounce e limite de tamanho. O overlay lê dela quando o servidor não
  respondeu. Isso é o que torna o app legível sem rede nenhuma, e também o que faz a pintura inicial
  ser instantânea com rede.
- **`resolveOverlayBase`** — função pura que decide se "nada" é resposta ou espera: espera enquanto
  os snapshots estão sendo lidos do disco ou enquanto há socket (a resposta está a caminho);
  **desiste** quando está desconectado e não há cache. Aí uma lista resolve para `[]` e a tela
  renderiza. Seis testes cobrem essa tabela de decisão — é a lógica que estava errada.

Consequência: `useEntityList` devolve `[]` offline sem cache (primeiro boot sem rede abre na Library
vazia, passo 7 do roteiro), e `useEntity` devolve `null` em vez de ficar pendurado.
