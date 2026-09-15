# Drag-and-drop reorder of checklist items, mirrored across applications

## Context

Checklist items carry a `position` field that is **written but never read for sorting**. Display
order today is simply array order — `grep -rn "position" src` shows it only ever assigned from an
array index (`checklist-service.ts:39,112,153`, `application-service.ts:23,230,262`) and used once
as a *join key* in `repeatApplicationWithTags`. Nothing in the app can reorder items; they can only
be appended, edited, or removed.

We want drag-to-reorder, with two hard requirements:

1. Reordering from inside an application must **mirror to every application of the same checklist**
   — drafts and completed alike.
2. It must change **order only**. Answers, notes, quantities, photos, tags and `answeredAt`
   timestamps already persisted must not be touched.

### The blocker

`buildApplicationItems` (`src/infra/services/application-service.ts:17`) copies template items into
an application with **fresh ids** (`aitem_…`) and keeps **no reference back to the template item**:

```ts
return checklist.items.filter((item) => !item.deletedAt).map((item) => ({
  id: generateId('aitem_'),
  position: item.position,
  title: item.title,
  ...
}))
```

The only link is `position` — and `repeatApplicationWithTags` (`application-service.ts:102`) joins
previous answers onto new items through it:

```ts
const previousItemsByPosition = new Map(
  sourceApplication.items.map((item) => [item.position, item]),
)
```

So renumbering template positions today would silently mis-map answers on "repetir visita". A stable
`checklistItemId` link must exist and be backfilled **before** any reorder UI ships, while `position`
is still a valid join key.

### Design

- **Single source of truth for order = the checklist template.** A reorder writes only the
  `checklists` document. No application document is ever rewritten — that is what structurally
  guarantees requirement 2, rather than relying on a careful mutation.
- **Order is derived at read time.** Screens sort `application.items` by the index of their
  `checklistItemId` in `checklist.items`. `useApplicationFill` already reads the checklist through a
  live `useQuery` (`checklistData ?? null`, not buffered), so mirroring is automatic and reactive —
  no fan-out mutation across applications.
- Ad-hoc items added inside a single application (`checklistItemId: null`) sort **after** template
  items, by their own `position`.

### Decisions already taken

| Question | Answer |
| --- | --- |
| Do completed applications follow the new order? | **Yes** — mirror everywhere. Nothing is snapshotted at completion. |
| Where can you drag? | **Both** `ApplicationFill` and `ChecklistForm` (new/edit). |
| Is drag blocked on completed applications? | **No** — left enabled. |

---

## Phase 0 — Pick the library

**`react-native-reorderable-list`** — latest `0.18.1` (published 2026-07-12, ~73k downloads/week,
325★, 11 open issues).

- **Zero new transitive dependencies.** It declares `dependencies: {}`; its peers are
  `react-native-reanimated >=3.12.0` and `react-native-gesture-handler >=2.12.0`, both already in
  `package.json` (reanimated `4.5.1`, gesture-handler `~2.32.0`). `GestureHandlerRootView` already
  wraps the app at `App.tsx:129`.
- **Reanimated 4 / New Architecture confirmed.** Issue #62 ("Support Reanimated v4") was closed
  2025-11-10 by the maintainer: *"Tested it with react native 0.82.1 and reanimated 4.1.4 and it
  works without issues."*
- **It solves our specific layout problem.** Both target lists live inside `Screen`'s outer
  `ScrollView`. This library ships `ScrollViewContainer` + `NestedReorderableList` precisely for
  nesting a reorderable list in a scroll container. The alternatives do not.

Rejected:

| Library | Why not |
| --- | --- |
| `react-native-draggable-flatlist` | Most downloaded (363k/wk) but stale — last publish **May 2025** (`4.0.3`), peer `reanimated >=2.8`, no Reanimated 4 validation. |
| `react-native-reorderable` (thiagobrez) | Needs `gesture-handler >=3` (we're on 2.32 — major bump) plus `@shopify/flash-list` **and** `@legendapp/list` as peers. 3 new deps, 2 versions published ever, 168 downloads/wk. |
| `react-native-reanimated-dnd` | Peers already satisfied, but it is a general DnD framework (droppables, collision detection) — far larger API surface than "reorder a list". |

```bash
bun add react-native-reorderable-list
```

No native module, no config plugin, no prebuild needed.

---

## Phase 1 — Stable link from application item → template item

**`convex/schema.ts`** — add to the `applicationItem` validator:

```ts
checklistItemId: v.optional(v.union(v.string(), v.null())),
```

Optional, so existing documents keep validating before the backfill runs.

**`src/infra/domain/entities/application.ts`** — mirror on `ApplicationItem`:

```ts
/** id of the checklist template item this was copied from; null for ad-hoc items added in this application only */
checklistItemId?: string | null
```

**`src/infra/services/application-service.ts`**:

- `buildApplicationItems` → set `checklistItemId: item.id`.
- `addApplicationItem` → set `checklistItemId: null`.
- `cloneExtraItem` → already spreads the source item, so it carries the value through unchanged.
- `repeatApplicationWithTags` → replace `previousItemsByPosition` and the `checklistPositions` set
  with `checklistItemId`-keyed equivalents. **Fall back to `position` when `checklistItemId` is
  absent**, so the function stays correct for any application not yet backfilled.

---

## Phase 2 — One-off backfill

New **`convex/migrations.ts`** with an internal mutation `backfillChecklistItemIds`: for every
non-deleted application, load its checklist via the `by_external_id` index and set each item's
`checklistItemId` to the template item at the **same `position`** (`null` when there is no match).
Idempotent — skip items that already have the field.

Add an npm script next to the existing `convex:seed`:

```json
"convex:migrate": "convex dev --once --run migrations:backfillChecklistItemIds"
```

> **This must run before Phase 6 is enabled.** Once template positions are renumbered by a reorder,
> `position` is no longer a valid join key and the backfill can no longer be reconstructed.

Match the Biome style of the rest of `convex/` — 2-space indent, single quotes, no semicolons.
(Note `convex/seed.ts` currently violates this; don't copy its formatting.)

---

## Phase 3 — Read-time ordering

New pure helper exported from **`src/infra/services/application-service.ts`**:

```ts
export function sortItemsByChecklistOrder(
  items: ApplicationItem[],
  checklist: Checklist,
): ApplicationItem[]
```

Ranks each item by the index of its `checklistItemId` in `checklist.items`; items with no match
(ad-hoc, or unmatched after backfill) rank last and tie-break on their own `position`. Returns a new
array — never mutates its input.

`getProgress` and `countNegativeAnswers` are order-independent and need no change.

---

## Phase 4 — Reorder mutation on the template

New in **`src/infra/services/checklist-service.ts`**:

```ts
export async function reorderChecklistItems(
  checklistId: string,
  from: number,
  to: number,
  repo: ChecklistRepository = checklistRepository,
): Promise<Checklist>
```

Reuse the pattern `updateChecklist` already follows: **re-read via `repo.findById(id)` first** — so a
reorder cannot clobber a concurrent title edit through `convex/checklists.ts:save`, which is a
whole-document `db.replace` — then apply the move and renumber `position: index` across all items so
array order and `position` stay in sync. Bump `updatedAt`.

No backend change needed; `checklists.save` already upserts the whole document.

---

## Phase 5 — `Screen` needs a swappable scroll container

**`src/components/Screen/index.tsx`** hardcodes `ScrollView` (`:120-140`). Add an optional prop:

```ts
/** Replaces the default ScrollView, e.g. ScrollViewContainer for nested reorderable lists */
ScrollComponent?: ComponentType<ScrollViewProps>
```

defaulting to `ScrollView`, rendered with the same props. This keeps `styles.content` padding intact
for both callers — cleaner than routing the whole screen body through the existing `content` escape
hatch (which bypasses the ScrollView entirely, as `Library` does).

---

## Phase 6 — UI, two entry points

Both use `NestedReorderableList` (with `scrollable={false}` — neither list has a fixed height) inside
a `Screen` given `ScrollComponent={ScrollViewContainer}`.

Shared conventions:

- Drag starts on long-press via `useReorderableDrag()` on a **grip handle**, using the
  already-registered-but-unused `grip-vertical` icon
  (`src/assets/icon-components/grip-vertical.tsx`, wired in `src/components/Icon/registry.ts:50`,
  referenced nowhere — a drag handle was clearly anticipated).
- `panGesture={Gesture.Pan().activateAfterLongPress(520)}` — the README's documented fix for
  stack-navigator swipe-back conflicts. Both screens are nested routes with a back gesture.
- Fire `Haptics.impactAsync` on drag start (`expo-haptics` is already a dependency).
- `keyExtractor` by `item.key` / `item.id`, as the current `.map()` calls already do.

**`src/app/ChecklistForm/ChecklistFormView.tsx:280-335`** — replace the `.map()` over `form.items`.
`onReorder` calls `form.setItems(reorderItems(form.items, from, to))`; `setItems` is already exported
from `useChecklistForm.ts:109`. Purely local form state — `updateChecklist` already derives
`position: index` from array order on save, so this screen needs no service change. The existing
`useUndoToast` pattern (currently used for item removal) can wrap the reorder for undo.

**`src/app/ApplicationFill/index.tsx:635-660`** — replace the `.map()` over `application.items`:

- Render `sortItemsByChecklistOrder(application.items, checklist)` (memoized) instead of
  `application.items`.
- `onReorder({from, to})` → optimistic local reorder of the displayed array, then
  `await reorderChecklistItems(checklist.id, from, to)`. **Do not call `setApplication`** — the
  application document stays untouched.
- `from`/`to` are indices into the *displayed* array; translate to template indices via the dragged
  items' `checklistItemId`. Ad-hoc items (`checklistItemId: null`) are not draggable — disable drag
  on them, or ignore reorders involving one.
- `editingItemIndex` (feeding `ItemDrawer`'s "item N of M" label) must be computed against the
  sorted array, not the raw one.

---

## Verification

1. `bun add react-native-reorderable-list && bun run typecheck && bun run lint`.
2. `bun run convex:seed` for the two seeded checklists (23 and 5 items), then `bun run convex:migrate`.
   Confirm in the Convex dashboard that existing `applications.items[]` now carry a
   `checklistItemId` matching the template ids at the same position.
3. `bun run ios` — **dev build required**; Reanimated 4 needs the New Architecture, Expo Go will not work.
4. **Mirror:** create two applications from `seed-checklist-apartamentos`. Answer several items in
   app A with notes and a photo. Reorder in app A → open app B → same new order. Reopen app A →
   answers, notes, photo and quantity still attached to the same item titles, `answeredAt` unchanged.
5. **Completed:** complete app A, then reorder from app B → app A shows the new order, answers intact.
6. **Template:** reorder in ChecklistEdit and save → all applications of that checklist reflect it.
7. **Ad-hoc:** add an item inside app A via "Adicionar item", then reorder template items → the
   ad-hoc item stays pinned at the bottom of app A and never appears in app B.
8. **Repeat visit:** reorder the template, then "repetir visita" from app A → previous answers land
   on the correct items. This is the regression the `checklistItemId` join fixes; verify it explicitly.
9. **Gesture:** edge swipe-back still pops the screen while the list is present, on iOS and Android.

---

## Reference

### Interaction with `plan/optimistic-updates-background-uploads.md`

That plan's **Phase 2 deletes the `seededId` buffer in `useApplicationFill` and renders from the
query**. The two plans are compatible and mutually reinforcing, but order matters:

- This plan does **not** depend on that refactor — the checklist half of `useApplicationFill` is
  already unbuffered, which is all the mirroring needs.
- If the optimistic-updates plan lands **first**, the `ApplicationFill` reorder handler gets simpler:
  drop the optimistic local reorder in Phase 6 and let the query re-emit drive the list.
- If this plan lands **first**, note that Phase 6 adds no new `setApplication` calls, so it does not
  enlarge the `setApplication` removal surface that plan's Phase 2 has to deal with.

### Library links

- [react-native-reorderable-list — GitHub](https://github.com/omahili/react-native-reorderable-list) ·
  [npm](https://www.npmjs.com/package/react-native-reorderable-list) ·
  [issue #62, Reanimated v4](https://github.com/omahili/react-native-reorderable-list/issues/62)
- [react-native-draggable-flatlist](https://github.com/computerjazz/react-native-draggable-flatlist)
- [react-native-reorderable (thiagobrez)](https://github.com/thiagobrez/react-native-reorderable)
- [react-native-reanimated-dnd](https://github.com/entropyconquers/react-native-reanimated-dnd)

### Spec backing

`spec.md:318-319` — *"Todo item deve possuir identificador e posição."* / *"A ordem dos itens deve
ser preservada."*
