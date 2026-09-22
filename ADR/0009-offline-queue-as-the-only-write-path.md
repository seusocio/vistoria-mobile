# 0009 — The offline queue is the only write path

- **Status**: Accepted
- **Date**: 2026-09-21
- **Affects**: `src/lib/offline-queue/`, every `*.ops.ts`, every container hook, `src/lib/uploads/upload-store.ts`, `convex/applications.ts`, `convex/checklists.ts`

## Context

The app felt fast, but the speed was borrowed from the network being up. Three things were true at
once:

1. **Nothing survived a kill.** `withOptimisticUpdate` lives in the `ConvexReactClient`'s memory,
   and so does Convex's own mutation queue. Both reconnect, neither survives the process dying. A
   vistoria filled in a basement was gone if iOS reclaimed the app.
2. **A photo taken offline did not exist.** Upload recovery rediscovered work by *querying the
   server* for attachments with `uploadStatus: 'pending'` — it needed the network to find out it had
   offline work to do. If `addAttachment` never reached the server, the file in
   `documentDirectory/uploads/` was an orphan forever.
3. **Two write styles coexisted.** Application screens used granular optimistic mutations; checklist
   screens used a service → repository → blocking `await`, with no optimism and no retry.

## Decision

**Every write goes through a persisted outbox, and every read applies the outbox on top of the
server's answer.** There is no second mechanism.

- A write is declared once as a `defineOp({ kind, mutation, applyLocal, entityId })`. `applyLocal`
  mirrors the Convex handler's merge rules and is the *same* function used for the optimistic
  overlay — one rule, not two that can drift.
- `useEntity` / `useEntityList` fold pending ops onto the `useQuery` result. An op leaves the queue
  only when its mutation resolves, and `await mutation(...)` resolves after the commit *and* after
  the client's queries have been updated — so the handoff from overlay to server doesn't flicker.
- The queue is zustand + `persist(AsyncStorage)` under `@vistoria/outbox`, drained FIFO, serially.

Consequences that are not obvious from the code:

- **`withOptimisticUpdate` is banned.** It discards its patch when *that* mutation settles, but a
  queued write has no mutation in flight to hold the patch — and after a restart the patch is gone
  entirely. Keeping both mechanisms means two sources of truth for "what is pending".
- **The drain blocks; it does not skip.** A later op routinely targets an entity an earlier one
  creates, and every Convex handler answers a patch against a missing row with `return null` — the
  write disappears with no error anywhere. So a head that exhausted its attempts blocks the queue
  and `SyncStatusBar` turns red; reconnect / foreground / boot call `retryFailed()` to unblock it.
- **Every mutation must be idempotent by the client-generated external id.** Replay is normal now,
  not exceptional: the queue outlives the process. `addItem` and `addAttachment` had to grow an
  existence check; `create` was already insert-if-absent, the `patch*` family is last-write-wins,
  and the three tables already carry a `by_external_id` index — so no `clientId` and no new index
  were needed.
- **Ops carry a `kind`.** The overlay treats "an entity the server doesn't have yet" as a row to
  merge into a list; without a kind, a pending `checklists.save` gets merged into the list of
  *applications* as a phantom row.
- **Ops must be registered eagerly** (`src/features/ops.ts`, imported by `App.tsx`). The drain can
  run before any screen mounts, and it looks ops up by the `type` string it persisted.
- **The upload queue is persisted too**, because the server row is not a reliable index of pending
  work — a photo taken offline has no row yet. Recovery now unions the local queue with the server
  scan, deduped by attachment id.
- **The last answer of every query is persisted too** (`snapshot.store.ts`). The outbox holds
  pending *writes*; it has nothing to say about an entity the user loaded while online. Convex keeps
  query results in the client's memory only, so without this the app has nothing to render after a
  restart with no network — and `useQuery` stays `undefined` forever, which the overlay would read
  as "still loading". Airplane mode meant a spinner on every screen.

## Consequences for new screens

No screen calls `useMutation` or a bare `useQuery`. No action waits on the backend, so there are no
"não foi possível salvar" error paths for writes, no unsaved-changes guards, and no discard sheets —
nothing is ever half-saved. `.agents/skills/offline-first-form/` carries the checklist.

## Not decided here

Conflict resolution between devices. Every op is last-write-wins per field, which is what the app's
single-inspector-per-vistoria usage actually needs. A genuine multi-writer feature would need more
than this queue.
