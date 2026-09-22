# App de Vistoria (React Native + Convex)

App mobile para preencher vistorias prediais em campo: um **checklist** é o modelo, uma
**aplicação** é uma visita preenchida a partir dele, e **tags** (torre, unidade, responsável)
cruzam tudo nos relatórios.

O requisito que manda na arquitetura é simples de dizer e difícil de cumprir: **o app é usado em
subsolo, escada e casa de máquinas, onde não tem rede.** Nada pode esperar o backend e nada pode
sumir se o iOS matar o processo.

## 🚀 Stack

- React Native 0.81 (Hermes) + Expo 57
- TypeScript estrito
- **React Navigation** (não é Expo Router)
- **Convex** — backend e fonte de verdade
- zustand (fila offline, uploads) + AsyncStorage (persistência dessas filas)
- react-hook-form + zod
- `@gorhom/bottom-sheet`, `@legendapp/list`, reanimated, moti
- Biome (lint/format), Bun (runtime de testes e scripts)

## 🧭 Como rodar

```bash
bun install
bunx convex dev        # publica as funções e mantém o deployment em sync
bun run ios            # ou: bun run android
```

`bunx convex dev` precisa estar rodando (ou ter rodado uma vez) antes do app gravar qualquer coisa —
uma tabela nova só aceita escrita depois que o schema foi publicado.

```bash
bun run typecheck      # tsc --noEmit
bun run lint           # biome
bun test src           # funções puras (fila offline, datas, cast)
bun run convex:seed    # tags, unidades e checklists iniciais (idempotente)
```

## 🏛️ Como o app grava

Toda escrita passa por uma **fila persistida** (`src/lib/offline-queue/`) e toda leitura aplica a
fila por cima da resposta do servidor. Isso é a decisão central do projeto —
[ADR 0009](./ADR/0009-offline-queue-as-the-only-write-path.md) explica o porquê, e
`.agents/skills/offline-first-form/` é o guia prático para escrever tela nova.

Em uma tela:

```ts
const application = useEntity<Application>(api.applications.findById, { id }, id, 'application')
enqueueOp(patchItem, { applicationId: id, itemId, patch, updatedAt })
```

`enqueueOp` é síncrono e nunca rejeita: persiste o op, pinta a tela na hora e drena quando dá. Por
isso não existe botão "salvar", nem guard de alterações não salvas, nem sheet de descartar.

## 📦 Estrutura

```
src/
├── app/                  # rotas finas: uma por tela, renderiza a view da feature
├── features/
│   ├── application/      # application-fill, application-new, photo-capture, shared/
│   ├── checklist/        # checklist-form, checklist-library, checklist-detail, shared/
│   ├── report/           # report-overview, shared/
│   ├── tag/shared/
│   └── ops.ts            # registra todos os ops no boot
├── lib/
│   ├── offline-queue/    # defineOp, outbox, overlay, dreno, retry
│   ├── forms/            # useDraft (RHF + zod + rascunho persistido)
│   ├── uploads/          # fila de upload de fotos, também persistida
│   ├── convex/           # client, normalize, file-storage, photo-picker
│   └── legacy/           # import único dos builds pré-Convex
├── components/           # componentes compartilhados entre features
├── routes/  styles/  utils/
convex/                   # schema, queries e mutations (idempotentes por id externo)
ADR/                      # decisões de arquitetura, com o motivo
plan/                     # planos de refatoração, incluindo os já executados
```

Cada feature é `*.container.ts` (um **hook**, sem JSX) + `*.view.tsx` (o **único** componente).

## 📚 Documentação

- [ADRs](./ADR/README.md) — por que as coisas são como são
- [`docs/README.md`](./docs/README.md) — guias dos componentes (pt/en)
- [`plan/`](./plan/) — planos de refatoração com contexto e verificação

## 📝 Licença

Uso interno.
