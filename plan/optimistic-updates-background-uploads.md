# Fix perceived latency: optimistic writes + background photo uploads

## Context

The app feels slow because **it uses Convex as a request/response API instead of a sync engine**.
Every user interaction blocks on a full round-trip before the UI changes, and the round-trip
itself is unusually fat.

Concretely, three compounding problems:

**1. Every tap awaits the server before rendering.**
`src/app/ApplicationFill/index.tsx:140` —
```ts
async function refresh(updater) { const updated = await updater(); setApplication(updated) }
async function handleAnswerChange(itemId, answer) {
  await refresh(() => updateApplicationItem(application!, itemId, { answer, suggested: false }))
}
```
Tapping an answer chip shows nothing until the mutation commits *and* the server sends back the
re-resolved entity. This is the exact anti-pattern the Zen of Convex names: *"it's rarely a good
idea to use [mutation return values] to set in-app state to update the UI. Let queries and the
sync engine do that."*

**2. Convex reactivity is deliberately switched off.**
`src/hooks/useApplicationFill.ts` seeds local state once via a `seededId` ref and ignores every
later `useQuery` emission. Because the screen renders from `useState`, not from the query cache,
`withOptimisticUpdate` would have **no visible effect at all**. This must be undone first — it is
the load-bearing change that makes everything else work.

Related: there is **no `useMutation` anywhere in the codebase**. All writes go through
`convexClient.mutation()` inside the repository classes (`src/infra/convex/*-repository.ts`),
which bypasses Convex's optimistic-update machinery entirely.

**3. Whole-document read-modify-write.**
`convex/applications.ts:save` takes the entire entity (`v.any()`) and `db.replace`s it. Every
answer tap ships the whole application (all items, all attachments) up *and* back down, with
`withImageUrls` resolving `ctx.storage.getUrl()` for every attachment on the return path.

Plus supporting offenders:
- `applications.listAll` / `listByChecklistId` resolve storage URLs for **every attachment of
  every application** — and **no list screen renders images** (verified: no `attachment`/`url`
  reference in Overview, Library, ChecklistDetail or their hooks). Pure waste, re-run on every write.
- N+1 sequential mutation loops: `handleGenerateSuggestions` (`ApplicationFill:347`),
  `handleSaveBatchEdit` (`ChecklistDetail:87`), `handleSaveApplication` (2 saves),
  `findOrCreateTagByLabel` (query-then-mutation, though `tags.create` already dedupes server-side),
  `removeApplication` (findById-then-softDelete).
- Photos upload at full camera resolution (`photo-picker.ts`, `quality: 0.85`, no resize → 4–8 MB).
- The upload queue is a component-scoped `useRef` — navigating away loses in-flight uploads.

Key facts from the Convex docs that make the fix safe:
- **Mutations are durable without awaiting them.** *"Convex React automatically retries mutations
  until they are confirmed to have been written to the database… every mutation call only executes
  once."* Client-issued mutations execute **serially in call order**. So we can fire and navigate.
- Optimistic update handlers **must be synchronous** (compile-time enforced) and must **never
  mutate** values read from the store.
- Upload URLs **expire in 1 hour**; the POST has a 2-minute timeout.
- There is **no official Convex offline support**; the client's mutation queue is **in-memory only**
  and does not survive an app kill. Durability across restarts has to come from our own data.

**Outcome:** answer taps, note saves, tag edits and navigation become instant (next frame), photos
appear immediately and upload in the background, and the Overview/Library screens stop doing
hundreds of pointless storage lookups on every write.

Decisions already made: **full refactor** (granular mutations + render-from-query + optimistic
updates), and **add both `zustand` and `expo-image-manipulator`**.

> ⚠️ `expo-image-manipulator` is a native module and `ios/` + `android/` are prebuilt — this
> requires `npx expo prebuild` and a dev-client rebuild. Do that in Phase 4, not before.

---

## Phase 1 — Granular Convex mutations

**`convex/schema.ts`** — extend the `attachment` validator (lines 13–23) so an attachment can exist
before its bytes do. This is what makes uploads durable across app restarts:
```ts
localUri: v.optional(v.string()),
uploadStatus: v.optional(v.union(
  v.literal('pending'), v.literal('uploaded'), v.literal('failed'),
)),
```
`storageId` is already `v.optional`, so a pending attachment is a natural fit.

**`convex/applications.ts`** — replace the single `save` with targeted mutations. Shared helper:
```ts
async function getApp(ctx: MutationCtx, id: string) {
  return ctx.db.query('applications')
    .withIndex('by_external_id', q => q.eq('id', id)).first()
}
```
All of these `ctx.db.patch` only the touched top-level field and **return `null`** (never the
re-resolved entity — that return payload is half the current cost):

| Mutation | Args | Replaces |
|---|---|---|
| `create` | `{ entity }` | insert-only path of `save` |
| `patchItem` | `{ applicationId, itemId, patch, updatedAt }` | `updateApplicationItem` |
| `patchItems` | `{ applicationId, patches: [{itemId, patch}], updatedAt }` | the suggestions loop |
| `addItem` | `{ applicationId, item, updatedAt }` | `addApplicationItem` |
| `addAttachment` | `{ applicationId, itemId: string\|null, attachment, updatedAt }` | both attach paths |
| `setAttachmentUploaded` | `{ applicationId, attachmentId, storageId, updatedAt }` | *(new)* |
| `setAttachmentDeletedAt` | `{ applicationId, itemId: string\|null, attachmentId, deletedAt }` | both remove paths |
| `updateMeta` | `{ applicationId, tagsIds?, date?, transcript?, status?, completedAt?, updatedAt }` | tags/date/transcript/complete |
| `setTagsForMany` | `{ applicationIds: string[], tagsIds, updatedAt }` | the `ChecklistDetail` batch loop |

Keep `softDelete` as-is. Delete `save` once all callers migrate. Do the same to
`convex/checklists.ts` only if time allows — it is not on a hot path.

**Query diet** in the same file:
- `withImageUrls` stays on **`findById` only**.
- Strip it entirely from `listAll` and `listByChecklistId` (verified unused by every consumer).
- Make `withImageUrls` fall back to `localUri` when there is no `storageId`, so pending photos
  render through the exact same code path as uploaded ones.

---

## Phase 2 — Render from the query, not from `useState`

**`src/hooks/useApplicationFill.ts`** — delete the `seededId` ref and the local `application`
buffer entirely. This is the change that makes optimistic updates visible:
```ts
export function useApplicationFill(checklistId: string, applicationId: string) {
  const checklistData = useQuery(api.checklists.findById, { id: checklistId })
  const raw = useQuery(api.applications.findById, { id: applicationId })
  const application = useMemo(() => (raw ? normalizeApplication(raw) : null), [raw])
  return {
    checklist: checklistData ?? null,
    application,
    loading: checklistData === undefined || raw === undefined,
  }
}
```

**Migration note — this removes `setApplication`**, which `ApplicationFill` currently uses for
in-progress text editing (`onNoteChange` at :673, `onQuantityChange` at :694, and the two
`set*AttachmentDeletedAt` optimistic-delete helpers). Replace with:
- **Note/quantity/tags in the item drawer:** a local `draft` `useState` keyed by `editingItemId`,
  seeded when the drawer opens, committed via `patchItem` in `onSave`. Uncommitted typing *should*
  be local — this is the one legitimate buffer.
- **Attachment delete + undo:** drop the manual local rollback. `setAttachmentDeletedAt` with an
  optimistic update gives the same instant feedback; `onUndo` fires a second mutation clearing
  `deletedAt`. Simpler and no rollback bookkeeping.

---

## Phase 3 — Optimistic mutation hooks

New `src/hooks/useApplicationMutations.ts`. The core is one shared, **synchronous, non-mutating**
helper that applies the same pure transform to every cached query that could show the application.
Use `getAllQueries` for `listByChecklistId` so we don't need to know the `checklistId` arg:

```ts
function patchAppEverywhere(
  store: OptimisticLocalStore,
  applicationId: string,
  fn: (app: Application) => Application,
) {
  const one = store.getQuery(api.applications.findById, { id: applicationId })
  if (one) store.setQuery(api.applications.findById, { id: applicationId }, fn(one))

  const all = store.getQuery(api.applications.listAll, {})
  if (all) store.setQuery(api.applications.listAll, {},
    all.map(a => (a.id === applicationId ? fn(a) : a)))

  for (const { args, value } of store.getAllQueries(api.applications.listByChecklistId)) {
    if (!value) continue
    store.setQuery(api.applications.listByChecklistId, args,
      value.map(a => (a.id === applicationId ? fn(a) : a)))
  }
}
```

Then each mutation pairs its server patch with the identical client transform:
```ts
const patchItem = useMutation(api.applications.patchItem).withOptimisticUpdate(
  (store, { applicationId, itemId, patch, updatedAt }) =>
    patchAppEverywhere(store, applicationId, app => ({
      ...app,
      items: app.items.map(i => (i.id === itemId ? { ...i, ...patch, updatedAt } : i)),
      updatedAt,
    })),
)
```

Handlers stop being `async` and stop awaiting:
```ts
function handleAnswerChange(itemId: string, answer: string) {
  const now = new Date().toISOString()
  void patchItem({
    applicationId: application.id, itemId, updatedAt: now,
    patch: { answer, suggested: false, suggestionSource: null, answeredAt: answer ? now : null },
  }).catch(() => setApplicationError('Não foi possível salvar a resposta'))
}
```
Always attach `.catch` — a dropped promise is an unhandled rejection, and the promise is the only
place errors surface.

**Where the domain logic goes.** `src/infra/services/application-service.ts` currently owns the
pure transforms (`buildApplicationItems`, `createAttachment`, the item-patch merge rules including
the `answeredAt` / `suggestionSource` derivation at :189-196). **Keep those as exported pure
functions and reuse them in both the optimistic updater and the Convex mutation handler** — one
source of truth, no drift between what the client predicts and what the server writes. Only the
`repo.save(...)` tails get deleted. `normalizeApplication` (`src/infra/convex/normalize.ts`) stays
exactly as-is.

The `ConvexApplicationRepository.save` wrapper (`src/infra/convex/application-repository.ts`) goes
away for these paths; the repository interface stays for reads and for the AsyncStorage migration.

---

## Phase 4 — Background photo uploads

The Convex-recommended RN pattern is **write the row first, upload after** — which also gives
durability across app restarts for free, since the pending attachments live in the database rather
than in an in-memory queue.

**`src/infra/convex/photo-picker.ts`** — add `exif: false`, and a `prepareAsset()` step:
1. `ImageManipulator.manipulateAsync(uri, asset.width > 1600 ? [{ resize: { width: 1600 } }] : [], { compress: 0.7, format: SaveFormat.JPEG })` — typically 4–8 MB → ~400 KB, the single biggest win on upload wall-clock.
2. `FileSystem.copyAsync` the result into `documentDirectory/uploads/` — the picker writes to the
   **cache** dir, which iOS can evict; a persisted pending upload must point at a stable file.

**`src/infra/uploads/upload-store.ts`** (zustand) — a module-level worker, not a component ref:
- `enqueue(job)` → immediately fire `addAttachment` (optimistically) with a **client-generated
  attachment `id`** (`generateId('attachment_')`, already the pattern), `localUri`, and
  `uploadStatus: 'pending'`. The thumbnail renders from `localUri` on the next frame.
- The worker drains with concurrency ~3: `generateUploadUrl` → POST via the existing
  `uploadImage()` in `src/infra/convex/file-storage.ts` (keep its web/native split as-is) →
  `setAttachmentUploaded({ attachmentId, storageId })`.
- Store holds only **transient progress** (`Record<attachmentId, number>`), since the durable state
  is the pending attachment row. No zustand `persist` needed.
- **Fetch the upload URL concurrently with compression**, not before it — compression takes
  200–500 ms, which fully hides the RTT. (A pre-fetched URL pool is possible given the 1-hour TTL,
  but this is simpler and buys the same thing.)
- On failure: `uploadStatus: 'failed'`, retry with backoff.
- **Resume on launch/foreground:** an `AppState` listener + a startup sweep re-enqueue any
  attachment with `uploadStatus: 'pending'` that isn't currently in flight. This is what makes an
  app kill mid-upload recoverable — the in-memory Convex mutation queue cannot do this.

**`src/app/ApplicationFill/index.tsx`** — the existing `pendingUploads` `useState` and the
`uploadQueue`/`latestApplication` refs (`:100-105`) all go away. Pending photos now arrive through
the normal `attachments` array, so `PhotoThumb`'s `uploading`/`progress` props and `ItemDrawer`'s
`pendingPhotos` prop just read `uploadStatus` + the store's progress map. **No component changes.**

---

## Phase 5 — Remove the remaining waterfalls

| Where | Change |
|---|---|
| `ApplicationNew:31` `handleSubmit` | Entity is already built client-side. Fire `applications.create` **without awaiting**, optimistically seed `findById`, `navigation.replace` immediately. `.catch` → navigate back + show error. |
| `ApplicationFill:380` `handleComplete` | Navigate first, fire `updateMeta({ status, completedAt })` in background. |
| `ApplicationFill:409` `handleSaveApplication` | One `updateMeta({ tagsIds, date })`; close the sheet immediately. |
| `ApplicationFill:347` `handleGenerateSuggestions` | One `patchItems` batch instead of N sequential saves. |
| `ApplicationFill:390` `confirmDelete` | Drop the `findById` pre-check — `softDelete` already no-ops when missing. |
| `ChecklistDetail:87` `handleSaveBatchEdit` | One `setTagsForMany` instead of the `for … await` loop. |
| `ChecklistDetail:124` `handleRepeat` | `repeatApplicationWithTags` does create-then-re-save; build the final entity locally, one `create`. |
| `tag-service.ts` `findOrCreateTagByLabel` | Drop the `findByNormalizedLabel` pre-query — `tags.create` already dedupes by `normalizedLabel` server-side. 2 RTTs → 1, plus optimistic insert into `api.tags.list` so the chip appears instantly. |

**Double-tap guards.** Once handlers are fire-and-forget, the navigating ones (`handleComplete`,
`handleRepeat`, `handleDuplicate`) need a `useRef` submitted flag — they currently have no loading
state at all and are already double-tappable.

---

## Phase 6 — Perceived-speed extras (cheap, do last)

1. **`ConvexQueryCacheProvider`** from `convex-helpers/react/cache` in `App.tsx`, wrapping
   `ConvexProvider`, with `useQuery` imported from `convex-helpers/react/cache`. It keeps
   subscriptions alive after unmount, so Library → Detail → Fill → back renders from cache instead
   of flashing a spinner. Requires adding `convex-helpers` (pure JS, no rebuild).
2. **`useStableQuery`** (ref pattern from *Help, my app is overreacting!*) for screens whose query
   args change — Overview's filters currently drop to `undefined` and flash `<Screen loading>` on
   every filter change.
3. **`useConvexConnectionState()`** → a small "Salvando…"/offline pill in the header instead of
   blocking spinners. Gives back the feedback the awaits used to provide, without the waiting.
4. Optional: `applications.listSummaries` projecting only `{ id, checklistId, tagsIds, date,
   status, completedAt, answeredCount, totalCount }` for Overview/Library, which currently pull
   every item of every application to compute counts.

`App.tsx:86` blocks first paint on `migrateLocalDataToConvex()`, but that early-returns after the
first run, so it only costs a cold-install launch. Leave it.

---

## Verification

- `bun typecheck` and `bun lint` clean.
- `npx convex dev` running; app on a physical device (the simulator hides network latency).
- **The core check:** enable Network Link Conditioner → "3G". Tap answer chips rapidly. Chips must
  flip on the next frame with no spinner, and the answered count must stay consistent. Before the
  change this is a visible per-tap stall.
- Open an item, type a note, save → drawer closes instantly, note persists after a reload.
- Add a photo → thumbnail appears immediately with progress. **Navigate away mid-upload, come
  back** → photo is there. **Force-quit mid-upload, relaunch** → upload resumes and completes.
- Kill the network mid-edit, make several edits, restore the network → all edits land, in order.
- Convex dashboard → Functions: `applications.listAll` execution time should drop sharply (no more
  `storage.getUrl` fan-out), and per-tap mutation payloads should go from whole-document to a few
  hundred bytes.
- Batch-edit tags on a group of N applications → one mutation in the dashboard log, not N.

---

## Reference

- [Optimistic Updates](https://docs.convex.dev/client/react/optimistic-updates) ·
  [OptimisticLocalStore](https://docs.convex.dev/api/interfaces/browser.OptimisticLocalStore)
- [Uploading and Storing Files](https://docs.convex.dev/file-storage/upload-files) ·
  [Uploading files from React Native or Expo](https://stack.convex.dev/uploading-files-from-react-native-or-expo)
- [The Zen of Convex](https://docs.convex.dev/understanding/zen) ·
  [Best Practices](https://docs.convex.dev/understanding/best-practices)
- [Help, my app is overreacting!](https://stack.convex.dev/help-my-app-is-overreacting) (`useStableQuery`)
- [convex-helpers](https://github.com/get-convex/convex-helpers) (`ConvexQueryCacheProvider`)