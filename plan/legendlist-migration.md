# Replace `.map` list rendering with LegendList + extract render functions into components

## Context

Today the app renders almost every list with `.map` inside a plain `ScrollView`. Only
`Library` is virtualized (a single `FlatList`); `ChecklistDetail` and `Overview` render
**unbounded** lists of heavy, animated cards (`ApplicationRow`, `PendGroupCard`) directly
inside `Screen`'s `ScrollView`, so every row mounts eagerly and stays mounted. The tag
picker in `TagMultiSelect` renders the entire tag catalog with no cap.

On top of that, the screens are built out of ad-hoc JSX-returning helpers — a 110-line
`listHeader` `useMemo` in `Library`, a ~31-line inline `renderItem` in `ApplicationFill`,
seven near-identical `renderFooter` functions declared inside component bodies. These
re-allocate on every render, defeat `memo` on the rows below them, and make the screens
hard to read.

**Outcome:** real lists become virtualized `LegendList`s; every JSX-returning helper becomes
a proper (memoized) component; `renderItem` survives only as a thin render prop that
delegates to one of those components.

### Decisions already made

- **Chip/wrap rows stay `.map`.** LegendList is a linear virtualized list — using it for
  2–4 tag chips in a `flexWrap: 'wrap'` row would break the wrap layout and add overhead
  for no gain. Those sites get extracted into small components instead.
- **The two drag-and-drop lists stay on `NestedReorderableList`** (`ApplicationFill` items,
  `ChecklistForm` items). LegendList has no reordering. Their inline `renderItem` JSX still
  gets extracted, and `ApplicationFill`'s optimistic reorder (`optimisticItems` /
  `reorderPending` / `handleReorder`) and background photo uploads are left untouched.

### Two sites I'd keep as `.map` despite the list-shaped data

`PendGroupCard.itemTitles` (`src/components/PendGroupCard/index.tsx:34`) and
`ApplicationRow.previous` (`src/components/ApplicationRow/index.tsx:111`) are **vertical
lists nested inside a row of the outer vertical LegendList**. A virtualized list inside a
virtualized row can't be measured (the parent needs a stable row height, the child needs a
bounded viewport), and `ApplicationRow`'s is additionally inside an `AnimatePresence`
height animation. Both are capped by one application's item count. Plan below extracts them
into components and leaves the `.map`. Say the word if you want them converted anyway.

---

## 1. Add the dependency

```
bunx expo install @legendapp/list
```

RN 0.86 / Expo 57 / new arch — LegendList v2 is fine here. No native config needed.

Shared conventions for every list introduced below:

- `keyExtractor` and `renderItem` are **module-level or `useCallback`'d**, never inline arrows.
- `recycleItems` stays **off** for rows that hold local state (`ApplicationRow` has
  `expanded`); on for the stateless ones.
- Use `ItemSeparatorComponent` rather than `gap` in `contentContainerStyle` — gap interferes
  with LegendList's item measurement.
- Pass `estimatedItemSize` from the row's real measured height.

---

## 2. `Library` — FlatList → LegendList, split the 110-line header

`src/app/Library/index.tsx:244` is already a `FlatList`; the problem is `listHeader`
(`:99-211`), which is a `useMemo` containing metrics, CTA, search row, section title **and
the entire `AppBottomSheet` tag-filter sheet** — a modal mounted inside `ListHeaderComponent`.

- Swap `FlatList` → `LegendList`; drop `initialNumToRender` / `maxToRenderPerBatch` /
  `windowSize` (LegendList doesn't use them), add `estimatedItemSize`.
- New `src/app/Library/components/ChecklistListItem.tsx` — `memo`, replaces `renderChecklist`
  (`:77-97`). Takes `checklist`, `stats`, `tagLabels`, `onPress`. Parent's `renderItem`
  becomes a one-line delegation.
- New `src/app/Library/components/LibraryHeader.tsx` — metrics + CTA + search row + filter
  button + section title only.
- New `src/app/Library/components/LibraryTagFilterSheet.tsx` — **moved out of the header**,
  rendered as a sibling of the list. `filterTags.map` (`:171`) → `LegendList` inside the
  sheet (see §5 for the bottom-sheet pattern).
- New `src/app/Library/components/LibraryEmpty.tsx` — from `listEmpty` (`:212-231`).

## 3. `ChecklistDetail` — `groups.map` → LegendList (biggest win)

`src/app/ChecklistDetail/index.tsx:234`. Unbounded groups of heavy `ApplicationRow`s inside
`Screen`'s `ScrollView`.

- Move from `Screen`'s `children` to its existing **`content` prop** (same pattern `Library`
  already uses at `src/app/Library/index.tsx:243`) so the LegendList owns the scroll.
  Reproduce the padding via `contentContainerStyle` — copy the shape of
  `src/app/Library/styles.ts:5` (`listContent`).
- Title / tags row / metrics row / "Histórico" heading → new
  `src/app/ChecklistDetail/components/ChecklistDetailHeader.tsx`, passed as
  `ListHeaderComponent`. Empty state → `ListEmptyComponent`.
- New `src/app/ChecklistDetail/components/ApplicationGroupRow.tsx` — `memo`, from the inline
  `groups.map` body (`:234-265`). It owns the `latestStatus` derivation and calls
  `onOpenEntry(id)` / `onRepeat(group)` / `onEditTags(group)` so the parent can pass stable
  `useCallback`s instead of five inline arrows per row.
- **Fix the memo-breaker:** `entries` is rebuilt inline at `:235` on every render. Precompute
  it once in the existing `groups` `useMemo` (`:43-46`) — build
  `{ ...group, entries }` there using `formatBrDateShort` + `countNegativeAnswers`, which are
  already imported.
- `recycleItems={false}` — `ApplicationRow` holds `expanded` state.
- `resolveLabels(checklist.tagsIds).map` (`:208`) → `<TagChipList />` (§7).

## 4. `Overview` — `pendingGroups.map` → LegendList

`src/app/Overview/index.tsx:187`. Same treatment as §3.

- Move to `Screen`'s `content` prop with a `LegendList` over `result.pendingGroups`.
- New `src/app/Overview/components/OverviewHeader.tsx` — the tag filter, period presets,
  custom range and metrics block (`:87-177`) as `ListHeaderComponent`.
- New `src/app/Overview/components/PeriodPresetRow.tsx` — from the `PRESET_LABEL` chips
  (`:102`); stays `.map`, five fixed chips.
- New `src/app/Overview/components/PendingGroupListItem.tsx` — `memo`, wraps `PendGroupCard`.
- **Fix the memo-breaker:** `itemTitles={group.items.map(...)}` at `:194` allocates a new
  array every render, so `memo` on `PendGroupCard` never hits. Derive it once in a `useMemo`
  over `result.pendingGroups` (alongside `resolveLabels`), or let
  `PendingGroupListItem` take the group and derive internally.
- Two empty states (`tagsIds.length === 0`, and no pendencies) → `ListEmptyComponent`.

## 5. `TagMultiSelect` — uncapped tag list → LegendList inside the sheet

`src/components/TagMultiSelect/index.tsx:223`, inside `BottomSheetScrollView`.

- Replace the `BottomSheetScrollView` + `suggestions.map` with a `LegendList` that hands its
  scroll view to the sheet:
  ```tsx
  <LegendList
    renderScrollComponent={BottomSheetScrollView}
    data={suggestions}
    ...
  />
  ```
  This is the one piece that needs verifying on device — if gesture handoff misbehaves, fall
  back to `@gorhom/bottom-sheet`'s own `BottomSheetFlatList`, which is already available from
  the installed v5.
- Sheet title / subtitle / selected chips / search box → `ListHeaderComponent` (new
  `TagMultiSelectSheetHeader`). "Criar …" row + "Nenhuma tag encontrada" → `ListFooterComponent`
  / `ListEmptyComponent`.
- New `src/components/TagMultiSelect/components/TagOptionRow.tsx` — `memo`, from the inline
  option `Pressable` (`:226-243`).
- The two chip rows (`:161`, `:195`) stay `.map`, via `<TagChipList />` (§7).
- Same `renderScrollComponent` pattern applies to the `Library` filter sheet (§2).

## 6. Photo galleries → horizontal LegendList

- `src/app/ApplicationFill/index.tsx:722-736` → new
  `src/app/ApplicationFill/components/ApplicationGallery.tsx` with a
  `<LegendList horizontal />` of `PhotoThumb`.
- `src/components/ItemDrawer/index.tsx:167` and `:174` → one `PhotoGalleryRow` component in
  `src/components/` shared by both, since the drawer renders active + pending photos with the
  same thumb.
- **Visual change to expect:** both are `flexWrap: 'wrap'` grids today; a horizontal
  LegendList makes them a single scrolling row. Filter `deletedAt` and merge the
  active/pending arrays into one `data` array **before** passing it in, not inside `renderItem`.
- Uploads: `PhotoThumb` keeps reading `uploadProgress[attachment.id]` from `useUploadStore`,
  and the enqueue path in `uploadAsset` (`:247-291`) is untouched.

## 7. Extract every JSX-returning helper

### 7a. Shared sheet footer — collapses 7 duplicates

New `src/components/SheetFooterActions/index.tsx`: a `BottomSheetFooter` with one primary
action and an optional secondary, props `{ confirmLabel, onConfirm, confirming?, cancelLabel?,
onCancel?, tone? }`. It exports a stable `footerComponent`-shaped render prop so the footer
stops remounting on every parent render.

Replaces: `ApplicationFill/index.tsx:587` and `:604`, `ChecklistFormView.tsx:220`,
`ChecklistDetail/index.tsx:109`, `ItemDrawer/index.tsx:64`, `TagMultiSelect/index.tsx:124`,
`ConfirmBottomSheet/index.tsx:29`.

### 7b. Shared `TagChipList`

New `src/components/TagChipList/index.tsx` — `memo`, props `{ labels, tone?, onRemove? }`,
renders the wrap row of `TagChip`. Replaces the `.map` at `ApplicationFill:665`,
`ChecklistDetail:208`, `ChecklistFormView:90`, `ChecklistCard/index.tsx:47`,
`PendGroupCard/index.tsx:24`, `TagMultiSelect:161` and `:195`.

### 7c. `ApplicationFill` inline `renderItem`

`src/app/ApplicationFill/index.tsx:772-802` (~31 lines, four inline arrow props per row) →
new `src/app/ApplicationFill/components/ApplicationItemRow.tsx`, `memo`, absorbing the
existing module-level `ReorderableApplicationItem` (`:71-110`). Parent's `renderItem` becomes
a one-liner; handlers become `useCallback`s taking `itemId`. `NestedReorderableList`,
`handleReorder`, `optimisticItems` and `reorderPending` stay exactly as they are.

### 7d. `ChecklistFormView`

- `src/app/ChecklistForm/ChecklistFormView.tsx:375-382` inline `renderItem` → delegate to the
  existing `ReorderableChecklistItem`, wrapped in `memo`.
- `templates.map` (`:245`) → new `components/TemplatePicker.tsx` (stays `.map`, 3 static cards).
- `form.options.map` (`:309`) → new `components/ResponseOptionsEditor.tsx` (stays `.map` — the
  pills contain `TextInput`s; virtualizing them would drop focus on recycle).

### 7e. Remaining small extractions

- `src/components/ApplicationRow/index.tsx` — the visit row markup is duplicated verbatim for
  `previous` (`:111-145`) and `latest` (`:150-177`). Extract one `VisitRow` component and use
  it for both. Keeps `.map` (see Context).
- `src/components/PendGroupCard/index.tsx:34` → extract `PendingItemRow`. Keeps `.map`.
- `src/components/ItemCard/index.tsx:95` (answer toggles) → `AnswerToggleRow`. Keeps `.map`.
- `src/components/Screen/index.tsx:39` (`ScreenSkeleton`'s `[0,1,2,3,4]`) — leave as is.

New components are exported through `src/components/index.ts` following the existing barrel
pattern; screen-local ones live under `src/app/<Screen>/components/` and are not barrelled.

---

## Verification

1. `bun run typecheck` and `bun run lint` — both are existing scripts in `package.json:10-11`.
2. `bunx expo run:ios` (or `bun start`) and walk the four converted screens:
   - **Library** — list scrolls, header scrolls with it, search + tag filter still narrow the
     list, empty state and "Limpar filtros" appear with a filter that matches nothing, filter
     sheet opens and selects.
   - **ChecklistDetail** — history list scrolls, a group expands/collapses and **keeps its
     expanded state while scrolling away and back** (this is the `recycleItems={false}` check),
     "Nova aplicação" and "Editar tags do grupo" still work.
   - **Overview** — pick tags, switch each period preset incl. custom range, pendencies list
     scrolls, both empty states render.
   - **ApplicationFill** — regression check, nothing here changed structurally: long-press
     drag still reorders items and the order holds while the mutation is in flight; adding a
     photo shows the progress overlay and settles; answers still save.
   - **TagMultiSelect** — open from any screen, type to filter, create a new tag, confirm the
     list scrolls inside the sheet and the sheet's own pan-to-dismiss still works.
3. Seed a large dataset (`bun run convex:seed`) and re-check that ChecklistDetail and Overview
   stay responsive where they previously mounted every row.
