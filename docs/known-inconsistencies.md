# Known inconsistencies

Found while splitting the large files on `refactor/split-large-files`. That refactor
changed no behavior, so none of these are fixed. Each one is a candidate for its own
issue. Each entry says where it lives and what a user would see.

## Search

There are three different ways to search, and two of them search the same thing (tags).

| Where | What it searches | How |
|---|---|---|
| Tag picker (`components/TagMultiSelect`) — new visit, item drawer, edit sheets, report filter | tag labels | Tap a row → bottom sheet opens with a **focused** input and live-filtered results, plus "+ Criar". |
| Checklist library (`checklist-library/components/LibraryHeader.tsx`) | checklist titles (and tag labels) | Inline `SearchBar` above the list, filtered **on the device** over the loaded list. A separate filter button opens `LibraryTagFilterSheet`. |
| Histórico (`checklist-detail/components/ChecklistDetailHeader.tsx`) | tag labels | Inline `SearchBar` ("Pesquisar por tag"), sent to the **server** as `q`, debounced (`use-history-groups.ts`). Falls back to filtering on the device while a regrouping write is pending. |

- Only the tag picker follows the pattern the product wants: a drawer with a focused
  input and dynamic results. The library and the histórico search inline.
- The library filters on the device and the histórico on the server. Once the library
  pages, its search will only find what has been loaded, which is the bug the histórico
  already fixed (see the comment on `APPLICATION_GROUPS_PARAMS`).

## Tag selection and creation

- **Three filter UIs for the same concept.** Library: single-select chip sheet, with no
  search and no create (`LibraryTagFilterSheet`). Report overview: multi-select
  `TagMultiSelect` **with "+ Criar"**. Histórico: free-text search by label.
- **Creating a tag from a read-only screen.** The report overview's filter passes
  `onCreateTag` (`report-overview.view.tsx`), so a user filtering a report can create a
  project-wide tag as a side effect. Every other place that creates tags is an edit
  screen.
- **Two ways to wire the same picker.** Forms use `Form.TagSelect` (react-hook-form
  `Controller`). The item drawer uses `TagMultiSelect` directly and pushes changes back
  with `itemForm.setValue(...)`. Both work; they differ in where validation errors can
  surface.
- **Web vs. mobile.** This repo has no web-specific search or tag UI. The only
  `Platform.OS === 'web'` branches are in the upload paths (`lib/api/uploads.ts`,
  `lib/convex/file-storage.ts`). The pickers rely on `@gorhom/bottom-sheet` and
  `SheetAwareTextInput`, and their behavior on web was not verified. If a separate web
  client exists, it isn't here, so cross-platform consistency can't be judged from this
  codebase.

## Dates

- **The same visit date can show two different days.** The visita header uses `fmtDate`
  (`application-visita/visita-format.ts`), which reads the ISO string's date part with no
  timezone. The histórico rows, the report and the date picker use `formatBrDateShort`
  (`utils/date.ts`), which parses into **local time**. "Repetir" stores
  `date: new Date().toISOString()`, so a visit repeated after 21:00 in Brazil (UTC−3)
  shows the next day in the visita header and today in the histórico.

## Sorting

- **The histórico's "numeric" sort is case-sensitive; "alpha" is not.** `naturalCompare`
  (`application-history.utils.ts`) compares non-digit runs by character code, so
  "Bloco 2" sorts before "apto" in numeric mode but after it in alpha mode.

## Smaller things

- **Native option pickers.** `application-completion-picker.ts`,
  `history-sort-picker.ts` and `application-visita/visita-prompts.ts` each implement the
  "ActionSheetIOS on iOS, Alert elsewhere" pattern. The visita ones now share one
  helper; the other two still have their own copies.
- **Two visit screens over one container.** `ApplicationFillView` (`?variant=A`) and
  `ApplicationVisita` both still ship. They now share the item drawer, the sheets, the
  delete confirmation and the item list, but the legacy view could be retired.
- **Dead Convex branches.** Every entity's `REST_ENABLED` flag is `true`, so each op's
  `send` (Convex) and the Convex upload/cleanup paths never run. Removing them is the
  "Step 7" cutover that ADR 0012 reserves for its own ADR.
- **The `resumePending` server scan finds nothing on REST.** A REST read never carries a
  `localUri` (see the comment in `upload-store.ts`). It is kept for Convex.
- **Formatting.** `checklist-form.ops.ts`, `utils/use-debounced-value.ts` and
  `routes/types.ts` use double quotes and semicolons; the rest of `src` doesn't. `bun run format` exists, but CI
  doesn't enforce it.
- **Lint.** `use-history-groups.ts` keeps a `useMemo` dependency list that Biome flags
  (`useExhaustiveDependencies`). It is deliberate (ADR 0008 memoization contract) but
  isn't marked with a `biome-ignore` comment explaining why, so `bun run lint` fails.

## Large files left as they are

These are still over 300 lines on purpose:

- `src/lib/api/endpoints/**`, `src/lib/api/zod/**`, `src/lib/api/models/**` — generated
  by orval (`bun run api:generate`); edits would be overwritten.
- `convex/seedData/*.ts` — data literals.
- `convex/*.ts` — the legacy Convex backend, deleted wholesale at the REST cutover
  (ADR 0012).
- `scripts/*.ts`, `docs/metabase/**/provision.ts` — one-off migration, import and
  provisioning scripts that run against real data and have no test harness. Splitting
  them is possible but carries risk for little day-to-day benefit.
