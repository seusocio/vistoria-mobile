# 0001 — Resiliência da sincronização offline (outbox + fila de uploads)

- Status: aceita
- Data: 2026-10-12

## Contexto

O app é offline-first. Toda escrita vira uma *op* na **outbox** (`src/lib/offline-queue`,
persistida em `@vistoria/outbox`) e é drenada **estritamente em FIFO**: a op na cabeça da
fila que falha de forma permanente (`failed`) bloqueia todas as de trás. As fotos têm uma
segunda fila, a **fila de uploads** (`src/lib/uploads/upload-store.ts`, persistida em
`@vistoria/upload-queue`), que depende da outbox: o `presign` do servidor só funciona para
um anexo cuja linha já existe, ou seja, depois que o `applications.addAttachment` saiu da
outbox.

Depois de um novo build no iPhone, nada que estava pendente sincronizava, a barra de status
ficava vermelha e a outbox chegou a ~4900 ops, crescendo sozinha.

## O que estava errado (causas, na ordem em que apareceram)

1. **Caminho absoluto de arquivo obsoleto.** `localUri` das fotos pendentes guarda
   `documentDirectory/uploads/...`. No iOS o container do app muda de UUID a cada
   build/update; o arquivo migra, mas o prefixo persistido fica velho.
2. **Ciclo de realimentação (outbox crescendo).** Falha de upload enfileirava a op
   `setAttachmentUploadStatus('failed')`; mexer na outbox re-armava os uploads, que
   falhavam e enfileiravam outra op, indefinidamente. Cada uma dava 404 no servidor.
3. **Ops de "dica de UI" bloqueando dados reais.** Essa mesma op, ao receber 4xx, virava
   `failed` na cabeça da fila e travava tudo atrás.
4. **Delete de algo que nunca chegou ao servidor.** `applications.deleteAttachment` de uma
   foto adicionada e removida offline retorna 404 (`anexo não encontrado`). O app tratava
   como falha permanente. **Era isso que travava a fila inteira** (posição 0), segurando
   os `create`/`addAttachment` de trás — por isso os `presign` davam 404.
5. **Máquina de estados do servidor.** O backend (`vistoria-api/src/domain/machines.ts`)
   só aceita `failed → pending → uploaded`. Fotos que receberam um `failed` no servidor e
   depois subiram tinham o `PATCH uploaded` recusado com 409, travando a fila de novo.
6. **Erros invisíveis.** O `fetcher` chamava `error.response.json()`, mas o ky 2.x já
   consome o corpo e o expõe em `error.data`; o corpo chegava `undefined` e só se via
   "Request failed with status code 404".

O backend não tinha bug: `presign` devolve 404 para anexo inexistente no projeto e
`addBatch` é idempotente. Os 404 eram consequência da fila presa.

## Decisões

| # | Decisão | Onde |
|---|---------|------|
| 1 | `rebaseLocalUri()` reaponta qualquer `.../uploads/<arquivo>` para o `documentDirectory` atual, no upload, na exclusão local e nas miniaturas. `resolvePreviewUri` prefere o caminho já corrigido (`useLocalUploadUris`) ao `attachment.localUri`. | `lib/convex/photo-picker.ts`, `lib/uploads/upload-store.ts`, `features/application/shared/attachment-preview.ts` |
| 2 | Re-armar uploads **só quando a outbox encolhe**, nunca quando cresce; marcar `failed` **uma vez por foto por sessão**. | `upload-store.ts` (`subscribeToUploadRecovery`, `markedFailed`) |
| 3 | `OpDefinition.bestEffort`: op que é só dica de UI é **descartada** em 4xx em vez de virar `failed`. Aplicada em `setAttachmentUploadStatus`. | `offline-queue/ops.ts`, `drain.ts`, `application.ops.ts` |
| 4 | `OpDefinition.treatNotFoundAsDone`: em ops de delete, 404 = já não existe = objetivo cumprido; resolve e segue drenando. Aplicada em `deleteAttachment`, `applications.softDelete`, `checklists.softDeleteCascade`. | idem + `checklist-form.ops.ts` |
| 5 | `compactOutbox()` roda ao reidratar: colapsa `setAttachmentUploadStatus` repetidos para o último por anexo. Limpou ~4400 ops sem perder dado do usuário. | `offline-queue/queue.store.ts` |
| 6 | **Auto-cura de linha ausente:** `presign` com 404 reenfileira `addAttachment` (uma vez por foto/sessão); o upload é liberado quando a op sai da outbox. | `upload-store.ts` (`healedRows`) |
| 7 | `markUploadedRest`: se `uploaded` voltar 409, passa por `pending` e depois `uploaded` (o blob já está no storage; o servidor reconfere tamanho e checksum). | `application.ops.ts` |
| 8 | `fetcher` usa `error.data`; a mensagem do servidor passa a chegar em `ApiError.message/body`. | `lib/api/fetcher.ts` |

## Regras para novas ops (como evitar que volte a acontecer)

A fila é FIFO e uma op `failed` na cabeça bloqueia tudo. Ao criar uma op em `*.ops.ts`:

1. **Pergunte: "se o servidor responder 4xx para sempre, isso pode travar dados reais?"**
   Se a op é só um sinal para a UI (status, contadores), marque `bestEffort: true`.
2. **Deletes devem ser idempotentes:** marque `treatNotFoundAsDone: true`.
3. **Respeite a máquina de estados do servidor** (`vistoria-api/src/domain/machines.ts`).
   Se uma transição pode ser recusada com 409 por um estado intermediário, a op deve
   conduzi-lo até o destino (como `markUploadedRest`), não falhar.
4. **Nunca enfileire uma op como reação a outra falha sem uma trava** (`Set` por
   id/sessão ou checagem de duplicata). Enfileirar muda a outbox; qualquer assinante da
   outbox que reaja a crescimento forma um ciclo.
5. **Nunca persista caminho absoluto de arquivo do app.** Se precisar guardar um, passe-o
   por `rebaseLocalUri()` ao usar. (Melhor ainda: persistir só o caminho relativo.)
6. **Erros de rede devem preservar a mensagem do servidor.** Não leia `response.json()`
   de um `HTTPError` do ky; use `error.data`.
7. Op nova que depende de outra (ex.: anexo depende da application) deve ficar **depois**
   dela na fila — a ordem FIFO já garante isso desde que ambas passem pela outbox.

## Como diagnosticar se acontecer de novo

- Barra de status vermelha = há op `failed` na cabeça; marrom = offline.
- A primeira op `failed` da outbox é a causa. O `ApiError` agora traz status, `code` e a
  mensagem do servidor: 404 em delete → regra 2; 409 `transição ilegal` → regra 3;
  4xx em `create`/`patch` de application → a application dela não existe no servidor
  (investigar o `create`).
- Se a outbox crescer sem parar, procure um assinante que enfileira em reação a mudança da
  própria outbox (regra 4).

## Consequências

- Uma foto cujo arquivo local foi realmente apagado (app desinstalado) continua sem
  recuperação; ela fica na fila de uploads falhando. Ainda não há estado "arquivo perdido".
- Ops 4xx genuínas (ex.: `patchItem` rejeitado) continuam travando a fila de propósito:
  pular uma op quebraria a ordem de dependência e perderia a escrita em silêncio.
- `bestEffort` e `treatNotFoundAsDone` descartam a op de forma silenciosa; só devem ser
  usados nos casos descritos acima.
