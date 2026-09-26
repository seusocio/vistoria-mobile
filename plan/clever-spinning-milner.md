# Convex → Vistoria REST API

## Context

The app's source of truth today is the in-repo Convex backend (`convex/`, 3 tables, 28 functions).
A real REST backend — **Vistoria API** (Hono + Better Auth + Postgres) — is now deployed at
`EXPO_PUBLIC_BACKEND_BASE_URL` (`https://vistoria.seusoc.io`), and its spec is vendored as
`openapi.json`. `orval.config.ts` is already configured against it but has never been run:
`src/lib/api/` does not exist.

Real-time is being dropped deliberately. React Query's cache — persisted to disk, written back from
mutation responses, invalidated by kinship — is enough to make the app feel live.

`plan/backend-postgres-metafields.md` §12 already planned this cut, as **five seams (A–E)**, and
that analysis holds: the offline layer is Convex-*typed*, not Convex-*logic'd*. This plan executes
§12 plus the three deltas the shipped backend introduced after that doc was written:

1. **Auth + `/{orgId}/` scoping on every route** — §12 doesn't mention either.
2. **Mutation responses are not uniformly the entity** — §12.2's `setQueryData` fix needs to be
   per-op, not generic.
3. **`Attachment` has no `deletedAt` and there is no restore endpoint** — the photo undo toast has
   no server representation.

Decisions taken for this plan: **dev-stubbed auth** (real session store + bearer wiring, token and
`orgId` from env for now; OTP screens are a separate follow-up), **straight cut with no
`FEATURE_FLAG.backend`**, **reports stay computed client-side**, **`expo-network` for connectivity**.

## What must not change

This is the acceptance criterion for the whole cut, from §13.1:

- `src/lib/offline-queue/queue.store.ts`, `retry-policy.ts`
- the pure functions in `overlay.ts`: `applyOps`, `mergePendingIntoList`, `resolveOverlayBase`
- all 13 `applyLocal` reducers in the three `*.ops.ts` files
- **all six test files** in `src/lib/offline-queue/__tests__/`

`bun test src/lib/offline-queue` must stay green **without editing a single test**. If a test needs
editing, the seam was cut in the wrong place.

## Step 0 — Generate the API client

`src/lib/api/fetcher.ts` must exist *before* `bun api:generate`, because `orval.config.ts` names it
as the mutator (`f`). Write it first.

**`src/lib/api/fetcher.ts`** — the one place that knows about transport:

- a `ky` instance with `prefixUrl` from `process.env.EXPO_PUBLIC_BACKEND_BASE_URL`
- `beforeRequest` hook attaching `Authorization: Bearer <token>` from the session store
- unwraps the `{ data, meta }` envelope so call sites get `data` directly; list endpoints need
  `meta.pagination` too, so expose a second export (`fList`) or return `{ data, meta }` for array
  responses only — decide once, in this file
- throws a typed `ApiError { status, code, message, body }`. **This is load-bearing**: it is what
  lets the drain distinguish a permanent 4xx (stop retrying, `fail` the op) from a 5xx/network blip
  (retry with backoff). Today the drain retries everything 5 times because Convex gave it no status.

**Fix `orval.config.ts` before generating.** All 23 domain operations are *untagged* in the spec
(the declared `tags[]` array is unused), so `mode: "tags-split"` dumps them into a single module
with generated names like `getByOrgIdApplications` and `patchByOrgIdApplication-itemsById`. Add
`output.override.operations[<operationId>].operationName` for the 23 domain ops to get readable
names (`listApplications`, `patchApplicationItem`, …). This is a config-only change and types flow
through it; do not hand-maintain a re-export wrapper.

Then `bun api:generate`. Commit the generated `src/lib/api/{endpoints,models,zod}` — it's a vendored
artifact like `openapi.json`.

## Step 1 — Session + orgId (prerequisite, not a follow-up)

Every generated hook takes `orgId` as a path param, so this blocks everything else.

**`src/lib/session/session.store.ts`** — zustand + `persist(AsyncStorage)` under
`@vistoria/session`, holding `{ token: string | null, activeOrgId: string | null, user }`. Seeded
from `EXPO_PUBLIC_DEV_TOKEN` / `EXPO_PUBLIC_DEV_ORG_ID` for now; the OTP flow writes the same fields
later, so nothing downstream changes when auth lands.

`orgId` is read **from the store inside the read/write wrapper layer**, not threaded through every
container — the containers never mentioned a deployment identifier under Convex either, and
threading it would touch every call site for no benefit. The drain and the upload queue are
non-React code and read `useSessionStore.getState()` directly, as they already do for the outbox.

**`orgId` must be part of every React Query key** (orval's generated keys already include path
params, so this is free — but verify it, or cached data bleeds across orgs).

On `401`, clear the session and surface it; do not build silent refresh in this step
(`/api/auth/refresh-token` exists and is where the OTP follow-up will hook in).

## Step 2 — Seams A, B and E, *while still on Convex*

This step is a pure refactor, mergeable on its own, with Convex still serving production. §12.1 is
emphatic about doing it first, and §12.2/13.1 explain why E in particular deserves a field day
by itself: it decides whether a screen opens in airplane mode.

**Seam A — `src/lib/offline-queue/ops.ts`**: replace
`mutation: FunctionReference<'mutation'>` with `send: (args: Args) => Promise<unknown>`. One line per
op. Initially each op's body is `(args) => convexClient.mutation(api.x.y, args)` — nothing changes
behaviourally.

**Seam B — `drain.ts` / `process-queue.ts`**: `MutationRunner` stops taking a `FunctionReference`
and the loop calls `op.send(item.args)`. `drainOutboxWith`'s signature keeps its injected-runner
shape so `drain.test.ts` keeps passing untouched.

**Seam E — `use-online-status.ts`**: `useConvexConnectionState().isWebSocketConnected` →
`expo-network`'s `useNetworkState()`. Also the two UI consumers:
`src/components/SyncStatusBar/index.tsx` (`hasInflightRequests` → React Query's `useIsFetching()` +
`useIsMutating()`) and `src/components/Screen/index.tsx:90`.

Note the semantic difference §12.2 flags and accepts: the socket meant "the backend is answering",
`expo-network` means "the radio has a link". A site wifi with a captive portal reads online and
isn't. Harmless in both consumers (the overlay waits one beat longer; a retry fails into backoff).
Do not build a health-check for it.

## Step 3 — Seam C: reads through React Query

Rewrite only `useServerOrSnapshot` in `src/lib/offline-queue/overlay.ts`. It currently takes
`(query: FunctionReference, args)`; it should take a React Query options object (orval generates
`get<Name>QueryOptions` / `<name>QueryKey`) and map React Query state onto `resolveOverlayBase`'s
existing four inputs — that function and its test do not change.

**Replace `snapshot.store.ts` with React Query persistence.** §12.1 assumed snapshot.store survives
with only its key changed, but it exists solely because "Convex keeps query results in the client's
memory only" — which stops being true. `persistQueryClient` with an AsyncStorage persister does the
same job, keyed correctly, with dehydration/GC handled. The mapping becomes:

- `server` → `data` when `isFetchedAfterMount`
- `cached` → `data` restored from the persister
- `snapshotsHydrated` → `useIsRestoring()` inverted
- `connected` → the seam E signal

Keep snapshot.store's two hard-won constants in the persister config: the **1 MB cap** (Android's
AsyncStorage silently rejects larger values) and the **debounced write**.

`useEntityList` expects a plain array but lists arrive as `{ data: [], meta: { pagination } }`. The
measured scale (2 checklists, ~60 applications/day) is far below `pageSize` max 100, so **request
`pageSize=100` and treat a full page as a bug to revisit** rather than building pagination the UI
has nowhere to show. Assert on `meta.pagination.pageCount > 1` in dev.

Also: `castConvex` (strips `_id`/`_creationTime`) has no counterpart and its call sites in
`useEntity`/`useEntityList` simply drop. `src/lib/convex/cast.ts` and its test are deleted.

## Step 4 — Seam A bodies: the 13 ops → 23 endpoints

Now each op's `send` becomes a real HTTP call. The mapping is a translation, not a rename — Convex
exposed one denormalized `applications` aggregate; REST splits items and attachments into their own
resources.

| op | endpoint |
|---|---|
| `tags.create` | `POST /{orgId}/tags/` |
| `checklists.save` | `POST /{orgId}/checklists/` if new, `PUT /{orgId}/checklists/{id}` if known |
| `checklists.softDeleteCascade` | `DELETE /{orgId}/checklists/{id}` |
| `applications.create` | `POST /{orgId}/applications` (client assembles the aggregate — §4.5) |
| `applications.updateMeta` | `PATCH /{orgId}/applications/{id}` |
| `applications.softDelete` | `DELETE /{orgId}/applications/{id}` |
| `applications.addItem` | `POST /{orgId}/applications/{id}/items` |
| `applications.patchItem` | `PATCH /{orgId}/application-items/{itemId}` |
| `applications.addAttachment` | `POST /{orgId}/applications/{id}/attachments` (body `{attachments:[…]}`) |
| `applications.setAttachmentUploaded` | `PATCH /{orgId}/attachments/{id}` `{uploadStatus:"uploaded"}` |
| `applications.setAttachmentUploadStatus` | same endpoint |
| `applications.setAttachmentDeletedAt` + `purgeAttachment` | **collapse into one** `DELETE /{orgId}/attachments/{id}` — see step 6 |

Reads, in the container hooks (all of them go through `useEntity`/`useEntityList`, so this is a
one-line change each):

| Convex query | endpoint |
|---|---|
| `checklists.list` | `GET /{orgId}/checklists/` |
| `checklists.findById` | `GET /{orgId}/checklists/{id}` |
| `applications.listAll` | `GET /{orgId}/applications?include=items,attachments` |
| `applications.listByChecklistId` | same, `?checklistId=` |
| `applications.findById` | `GET /{orgId}/applications/{id}?include=…` |
| `tags.list` **and** `tags.listAll` | `GET /{orgId}/tags/` — the spec has no `includeDeleted`, so these collapse to one call and `use-tags-catalog.ts` loses its second query |

**Persisted-queue compat (§12.3)**: `setAttachmentUploaded` carries `storageId` in args, which
becomes `storageKey`. An op enqueued before the cut and drained after would fail and — because the
head blocks — jam the whole queue. Accept both in its `send`:
`args.storageKey ?? args.storageId`. One line, and field devices genuinely go offline across a
deploy.

**404 policy**: Convex answered a patch against a missing row with `return null`; the REST API
returns `404`. The FIFO-blocking rationale in `drain.ts` assumes the write is never silently lost,
so map `404` on a patch-style op to **block the head** (not resolve, not drop) — it means the
`create` ahead of it hasn't landed, which is exactly what blocking is for. Other `4xx` → `fail`
permanently. `5xx`/network → retry with backoff.

## Step 5 — Server write-back, to kill the flicker

This is §12.2 and it is not optional. Under Convex, `await mutation(...)` resolved *after* the
client's queries were updated, so the optimistic overlay and the server value swapped atomically.
REST has no such guarantee: the op leaves the outbox, the overlay drops, and the screen snaps back
to the last value it read — the one *before* the write. It flickers backwards.

§12.2 prescribes `setQueryData` from the mutation response before `resolve(item.id)`. But the
responses are **not uniformly the entity**, so this must be per-op:

- `POST`/`PATCH /applications/{id}` → the full `Application`
- `PATCH /application-items/{id}` → one item (or an array, when the body carries `ids[]`)
- `POST /applications/{id}/attachments` → `Attachment[]`
- every `DELETE` → `{ id }` only

So extend `OpDefinition` with two optional hooks and give `drain.ts` a `QueryClient`:

```ts
interface OpDefinition<Args, Entity> {
  // …existing: type, kind, applyLocal, entityId
  send: (args: Args) => Promise<unknown>
  /** Writes the server's applied state into the cache before the overlay drops. */
  onServerResponse?: (qc: QueryClient, args: Args, response: unknown) => void
  /** Lists whose server-computed aggregates applyLocal cannot recompute. */
  invalidates?: (args: Args) => QueryKey[]
}
```

`invalidates` covers the counts the server owns and `applyLocal` cannot derive:
`answeredCount`/`totalCount`/`negativeCount`/`attachmentsCount` on `Application`,
`applicationsCount`/`completedCount` on `Checklist`. Without it, answering an item never updates the
card on `checklistDetail` — §13.1 checks exactly this.

## Step 6 — Seam D: uploads

The protocol inverts. Today: `POST` to a Convex URL, read `{ storageId }` from the response body.
Now: get the key *before* uploading, `PUT` the binary, confirm separately. The presigned `PUT`
returns an **empty body** — nothing can be parsed from it.

New flow in `src/lib/api/uploads.ts` (replacing `src/lib/convex/file-storage.ts`):

1. `POST /{orgId}/uploads/presign` `{ keys: [{ attachmentId, contentType }] }` →
   `{ key, uploadUrl, method, headers, expiresAt }[]`
2. `FileSystem.createUploadTask(uploadUrl, uri, { httpMethod: <method from response>, uploadType: BINARY_CONTENT, headers: <headers from response> })` — keep the existing `onProgress` wiring, the progress bar is unchanged
3. success → `enqueueOp(setAttachmentUploaded, { …, storageKey: key })`, which drains to
   `PATCH /attachments/{id} {uploadStatus:"uploaded"}`; the server `HEAD`s the object and records
   the real size and checksum

**The two queues must not serialize** (§4.3 disclosure 5). §4.3 states the presign route is
stateless — the key is deterministic from `applicationId`/`itemId`/`attachmentId`, all known the
moment the photo is taken — so presign does **not** require the attachment row to exist, and a photo
still uploads while the outbox is blocked on a stuck head. *Verify this against the deployed API
before relying on it* — if presign 404s on an unknown `attachmentId`, that is a backend change to
request, not something to work around by making the upload queue wait for the outbox.

**`resumePending()`'s second source needs rework.** It currently scans
`convexClient.query(api.applications.listAll)` for attachments with
`localUri && !storageId && uploadStatus !== 'uploaded'` — but the REST `Attachment` returns neither
`localUri` nor `storageId` (it has `storageKey`). Rewrite the scan as
`GET /{orgId}/applications?include=attachments` filtered on
`uploadStatus !== 'uploaded' && storageKey == null`, and match against the persisted local queue by
attachment id to recover the `localUri`. An attachment the local queue doesn't know about has no
local file to send, so it is unrecoverable by definition — skip it rather than marking it failed.

**Photo undo (`use-attach-photos.ts`).** `DELETE /attachments/{id}` is soft on the server but there
is **no restore endpoint**, and `Attachment` responses carry no `deletedAt` — so the current
"enqueue `setAttachmentDeletedAt(now)` immediately, `purgeAttachment` on commit, `setAttachmentDeletedAt(null)`
on undo" cannot survive as-is.

Recommended: **move the enqueue to `onCommit`**. `removeAttachment` hides the photo with local state
for the toast window and enqueues nothing; `onUndo` just drops that local state; `onCommit` enqueues
a single `attachments.delete` op. This collapses two ops into one and removes the op that has no
endpoint. The tradeoff is explicit: killing the app inside the ~5s toast window makes the photo
reappear. That loses no data and the user can delete again — strictly better than a delete that
cannot be undone.

Also delete `src/lib/legacy/migrate-to-convex.ts` and its `App.tsx` call — it imports from
AsyncStorage into Convex and has no meaning after the cut.

## Step 7 — Data migration and removal

§12.5 owns this end to end: export from Convex, transform, copy blobs to R2 (resumable and
idempotent — `HEAD` before `PUT`, the key is deterministic), verify counts, then the freeze window
(announce → `SyncStatusBar` at 0 on every device → re-run the idempotent import → verify → switch).

Then `git rm -r convex/`, drop `convex`/`convex-helpers` from `package.json`, remove the
`convex:*`/`seed:*` scripts, and write **`ADR/0012`** recording the cut: the five seams, the loss of
push reactivity and what replaced it, and the undo tradeoff above. Update `README.md`, which still
says "Convex — backend e fonte de verdade".

## Verification

**Static** — `bun run typecheck && bun run lint`, then:

- `bun test src/lib/offline-queue` — green **with no test edited**. This is the primary signal that
  the seams were cut in the right places.
- `grep -rl convex src` → after step 2, only the seam files and `*.ops.ts`; after step 7, nothing.
- `GET /applications/{id}` against the same id in both backends — diff should be only the `{data}`
  envelope, `storageId`→`storageKey`, the new `metadata: {}`, and the server-computed counts.
- `GET /{orgId}/reports/tags` vs local `queryApplicationsByTags` on the same data → identical
  `itemProgress` / `applicationProgress` / pending groups. We keep computing client-side, but this
  cross-check is how we find out if the client math is wrong.

**On a device** (§13.1 — none of this is covered by typecheck, and per prior experience this
refactor has never yet been exercised on hardware):

| What | How | Expected |
|---|---|---|
| Airplane mode opens | after step 2, still on Convex: airplane mode → open a visited vistoria | opens from cache, no spinner |
| Overlay does not flicker | answer an item on good network, watch the row | new value lands and stays; no frame showing the old value when the op leaves the queue |
| Aggregates update | answer an item → back to `checklistDetail` | `answeredCount` on the card rose with no pull-to-refresh |
| Cold start offline | kill offline, reopen, enter a vistoria | snapshot + pending ops applied; no infinite spinner |
| Create offline | airplane → `applicationNew` → fill → reconnect | one row on the server, items assembled by `buildRepeatedApplication` |
| Uploads don't wait on the outbox | block one route so the head jams, then take a photo | the photo **uploads**; `setAttachmentUploaded` queues behind the jam |
| Upload progress | 10 photos in `photoCapture` | per-photo progress bar, as today |
| Queue survives the cut | enqueue `setAttachmentUploaded` pre-cut, deploy, drain | applies via the `storageKey ?? storageId` fallback |
| Undo | delete a photo, undo; delete a photo, let it commit | reappears; then gone and gone on the server |
| Multi-org isolation | switch `activeOrgId` | no data bleed from the previous org's cache |

## Notes for the backend

- 23 domain operations are **untagged**, and the declared `tags[]` array is unused. Tagging them
  would make `mode: "tags-split"` produce per-resource modules and readable operation ids, removing
  the `operationName` overrides from step 0.
- No `security` requirement is declared on any operation even though every `/{orgId}/` route is
  protected, so generators emit no auth wiring.
- Domain schemas are inlined per-operation via JSON-Schema `$id` (which OpenAPI ignores), which is
  most of the 845 KB and duplicates every shape ~24 times.
- `uploads/presign` statelessness (step 6) needs confirming.
- No restore endpoint for a soft-deleted attachment (step 6) — worth adding if undo should be
  durable rather than toast-local.
