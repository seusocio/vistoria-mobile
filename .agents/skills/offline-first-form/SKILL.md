---
name: offline-first-form
description: Como escrever qualquer tela que lê ou grava dados neste app — fila offline persistida (defineOp/useEntity/useDraft), estrutura feature-first com container-hook + view, e mutations idempotentes no Convex. Use SEMPRE que a tarefa envolver criar tela nova, adicionar um campo que salva, mexer em formulário, trocar uma leitura de dados, ou revisar/auditar uma feature existente — mesmo que o pedido seja só "adiciona um botão que marca como concluído". Use também quando algo "não salvou", "sumiu depois de fechar o app", "duplicou" ou "trava sem internet".
---

# Feature offline-first

Este app grava **sempre** por uma fila persistida. Nenhuma ação do usuário espera o backend, e nada
se perde se o iOS matar o processo. Isso não é uma otimização opcional: a decisão está registrada na
[ADR 0009](../../../ADR/0009-offline-queue-as-the-only-write-path.md) e o app inteiro depende dela.

**Stack real** (as skills vendoradas do ecossistema assumem Expo Router + TanStack Query — aqui não é
isso): React Native + **React Navigation** + **Convex** + zustand + react-hook-form + zod.

## As 5 regras

1. **Nenhuma ação espera o backend.** Toda escrita é `enqueueOp(...)`, que é síncrona e nunca
   rejeita. Não existe `await mutation`, não existe `try/catch` com "não foi possível salvar", não
   existe spinner de "salvando".
2. **Toda escrita é um `defineOp` com `applyLocal` que espelha o handler do Convex.** O mesmo
   `applyLocal` serve de overlay otimista e de replay local. Se ele divergir do handler, a tela
   mostra uma coisa e o servidor calcula outra.
3. **Leitura é sempre `useEntity` / `useEntityList`.** `useQuery` cru numa tela é bug por dois
   motivos: não enxerga o que está na fila (entidade criada offline não aparece) e **nunca resolve
   sem socket** — `undefined` para sempre, spinner para sempre. O overlay cobre os dois: aplica os
   ops pendentes e cai no snapshot persistido da última resposta quando não há rede.
4. **Rascunho de entidade que ainda não existe vive no `useDraft`.** Formulário de criação não tem
   entidade para gravar ainda — o rascunho fica em AsyncStorage até a ação primária ("Criar",
   "Iniciar") transformá-lo em `create`.
5. **Mutation do Convex é idempotente pelo `id` externo.** A fila sobrevive ao processo, então
   replay é normal. `create` é insert-if-absent; `add*` checa existência por id; `patch*` é
   last-write-wins.

## A árvore de uma feature

```text
src/features/<domínio>/<feature>/
├── index.ts                      # exporta só a view
├── <feature>.container.ts         # hook useXContainer — SEM JSX, SEM componente
├── <feature>.view.tsx             # o único componente; chama o hook e renderiza
├── <feature>.schema.ts            # zod, se tiver formulário
├── <feature>.styles.ts
└── components/                    # componentes só desta feature

src/features/<domínio>/shared/
├── <domínio>.types.ts             # as entidades
├── <domínio>.utils.ts             # funções PURAS
└── <domínio>.ops.ts               # um defineOp por mutation
```

A rota em `src/app/<Tela>.tsx` é fina: recebe `route.params`/`navigation` e renderiza a view. Ela
**não** repassa o estado da feature.

### Container é hook, não componente

```ts
// ✅ <feature>.container.ts
export function useXContainer({ id, navigation }: UseXContainerProps) {
  /* ... */
  return { loading, items, onToggle, onSave }
}

// ✅ <feature>.view.tsx
export function XView(props: UseXContainerProps) {
  const c = useXContainer(props)
  return <Screen loading={c.loading}>{/* ... */}</Screen>
}
```

```tsx
// ❌ container-componente que repassa 25 props para uma interface espelhada à mão
export function XContainer(props) {
  const state = useEverything()
  return <XView {...state} />   // cerimônia pura: a view é o único consumidor
}
```

**Consequência que pega todo mundo:** um hook não pode pular a própria chamada condicionalmente. O
truque antigo de "componente-gate fora, componente-pronto dentro" não existe mais, então `useDraft`
é chamado **sempre**, inclusive durante o loading. Dois caminhos:

- `defaultValues` depende do dado assíncrono → use `hydrated && !hasPersistedDraft` antes de
  `form.reset(dadoDoServidor)`. Resetar depois que um rascunho persistido já venceu descarta a
  edição do usuário, e qual das duas leituras async ganha a corrida não é determinístico.
- `defaultValues` é estático → um `EMPTY_X` de fallback basta.

## Escrevendo um op

```ts
export const patchItem = defineOp<PatchItemArgs, Application>('applications.patchItem', {
  kind: 'application',                        // 1
  mutation: api.applications.patchItem,
  applyLocal: (entity, args) => {
    if (!entity) return null                  // 2
    return applyApplicationItemPatch(entity, args.itemId, args.patch, args.updatedAt)  // 3
  },
  entityId: (args) => args.applicationId,     // 4
})
```

1. **`kind`** separa os tipos no overlay. Sem ele, um `checklists.save` pendente é injetado na lista
   de *applications* como uma linha fantasma.
2. **O guard de `null` é obrigatório em op de patch.** A entidade que o patch mira pode legitimamente
   ainda não existir (um `create` em voo, uma reconexão lenta) — isso é normal, não corrupção. O
   handler do Convex faz `if (!entity) return null`; o `applyLocal` tem que fazer o mesmo, e não
   `entity as Entity` seguido de crash duas linhas abaixo.
3. Reuse a mesma função de merge que o handler usa, quando existir.
4. `entityId` é a chave de agrupamento do overlay.

Depois: **registre o módulo em `src/features/ops.ts`**. A fila é drenada por `App.tsx` antes de
qualquer tela montar, e ela procura o op pelo `type` que persistiu.

## Auditoria

Rodável sem ler o código. Para cada feature em `src/features/*/*/`:

| Existe? | Se faltar, significa |
|---|---|
| `<feature>.container.ts` exportando `useXContainer` | a lógica está na view, ou tem um container-componente drilando props |
| `<feature>.view.tsx` como único componente | ver acima |
| `index.ts` exportando só a view | a rota está alcançando dentro da feature |
| `shared/<domínio>.ops.ts` com `kind` em todo `defineOp` | ops sem `kind` contaminam listas de outro tipo |
| import do `.ops` em `src/features/ops.ts` | op persistido pode sobreviver ao código que sabe repetir ele → vira `failed` no boot |

E estes greps devem voltar **vazios** fora de `src/lib/`:

```bash
grep -rn "useMutation\|withOptimisticUpdate" src/features src/app   # regra 1 e 2
grep -rn "from 'convex/react'" src/features src/app                 # regra 3
grep -rn "await .*mutation(" src/features src/app                   # regra 1
```

## Armadilhas já pagas

- **`handleSubmit(onSave)` sem o segundo callback come o `haptics.error()`.** Sempre
  `handleSubmit(onSave, () => haptics.error())` — ou use `commit()` do `useDraft`, que já faz isso.
- **`useFieldArray({ keyName: 'key' })`** sempre. O default do RHF é `id`, e `id` aqui já é o id
  persistido do item — o RHF sobrescreve e o item passa a salvar com o id errado.
- **Overlay tem que preservar identidade de objeto** dos itens não tocados
  ([ADR 0008](../../../ADR/0008-memoization-contract-for-sections-and-rows.md)). Um `applyLocal` que
  recria todos os itens quebra o `memo()` das rows e a lista inteira re-renderiza a cada toque.
- **Não existe guard de "alterações não salvas"** — auto-save na fila torna o conceito impossível.
  Se um dia voltar a existir algum guard de navegação, é `usePreventRemove`, não `beforeRemove`.
- **`setTagsForMany`-style (uma mutation, N entidades) não vira um op só.** Um op tem um `entityId`;
  enfileire N ops de uma entidade cada, senão o overlay não consegue pintar nenhuma das linhas.
- **A fila bloqueia no primeiro item que falhou.** É de propósito (FIFO real). Se a barra de sync
  está vermelha, tem op estourado no topo — `retryFailedOps()` roda sozinho em reconexão/foreground.

## Restrições não-negociáveis

Cada uma existe porque já quebrou uma vez. Leia antes de mexer em lista ou accordion:

- [ADR 0003](../../../ADR/0003-never-unmount-collapsed-content.md) — conteúdo colapsado nunca desmonta.
- [ADR 0004](../../../ADR/0004-one-pan-gesture-per-reorderable-list.md) — um `useReorderablePanGesture()` por lista, chamado dentro dela.
- [ADR 0005](../../../ADR/0005-section-local-expand-state.md) — `expandedGroupIds` fica na section, não sobe pro container.
- [ADR 0008](../../../ADR/0008-memoization-contract-for-sections-and-rows.md) — props por chave (`onEdit: (id) => void`), sem closure por linha, sem objeto literal inline.

## Templates

`templates/` tem o esqueleto de cada arquivo: [container](templates/feature.container.ts.md),
[view](templates/feature.view.tsx.md), [ops](templates/feature.ops.ts.md),
[schema](templates/feature.schema.ts.md).
