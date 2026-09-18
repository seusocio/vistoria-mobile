# Adopt react-hook-form + zod across all forms

## Context

Every form in this app is hand-rolled `useState`. There is no form library, no schema
validation, and no dirty tracking anywhere (verified: zero hits for `react-hook-form`,
`formik`, `zod`, `yup` in the repo). The cost shows up in three places:

**1. Re-render storms on every keystroke.** `ChecklistFormView` holds the whole checklist
form as four `useState` slices in `useChecklistForm.ts:43-50`, passed down as one `form`
object. Because that object is a new reference every render, `ResponseOptionsEditor`'s
`memo()` (`ResponseOptionsEditor.tsx:30`) never hits — so typing one character in an option
label at `ResponseOptionsEditor.tsx:56` re-renders the title input, the tag multi-select,
every option pill *and* the reorderable item list. Same for the title field at
`ChecklistFormView.tsx:134`.

**2. Draft state is copied field-by-field, by hand.** Opening the item sheet runs four
`setState` calls (`ChecklistFormView.tsx:66-72`); the ApplicationFill item drawer rebuilds
its entire draft object with fallbacks on every change (`ApplicationFill/index.tsx:659-684`).
`ChecklistEdit` even splits into an inner `ChecklistEditForm` component
(`ChecklistEdit/index.tsx:82-107`) purely to seed the hook after the Convex query resolves —
a workaround for the absence of `reset()`.

**3. Validation rules are duplicated and field-less.** The same rules are written twice —
once as an inline `if` in the component, once as a `throw new Error` in the service layer:

| Rule | Component | Service |
|---|---|---|
| checklist title required | — | `checklist-service.ts:67`, `:100` |
| checklist needs ≥1 item | — | `checklist-service.ts:69-72`, `:122-124` |
| application needs ≥1 tag | `ApplicationNew:68/72`, `ApplicationFill:376`, `ChecklistDetail:104` | `application-service.ts:46` |
| application date required | — | `application-service.ts:47-50` |
| item title required | `ChecklistFormView:95`, `ApplicationFill:401` | `application-service.ts:244` |
| tag label non-empty | `useTagsCatalog.ts:38` | `tag-service.ts:34` |

Service errors are thrown as bare `Error`s with no field key, so screens can only dump them
into a single `error` string — no per-field messages anywhere. No component accepts an
`error` prop today.

**Outcome:** typing in a form re-renders only the field being typed in; each form has one
declarative zod schema that both the screen and the service use; leaving a form with unsaved
edits prompts instead of silently discarding.

### One correction to the framing

The ask was framed as "mutations should be synchronous and saved manually — better for
performance." **Manual save is already how nearly every form behaves.** Verified:

- Item drawer note/tags/quantity → local draft, one `patchItem` on `onSave`
  (`ApplicationFill/index.tsx:695-708`). No per-keystroke write.
- Application meta (tags + date) → one `updateMeta` on Salvar (`:375-391`).
- Add-item sheet → one `addItem` on Adicionar (`:400-429`).
- Checklist create/edit → one `createChecklist` / `updateChecklist` on submit
  (`ChecklistNew/index.tsx:57`, `ChecklistEdit/index.tsx:33`).
- Batch tag edit → one `setTagsForMany` (`ChecklistDetail/index.tsx:111-119`).

So this refactor does **not** reduce Convex mutation count — that was already fixed by
`plan/optimistic-updates-background-uploads.md`. The win here is **React re-renders** (RHF
keeps field state out of the render cycle) plus validation dedup and dirty tracking. Worth
doing on its own merits; just not for the reason stated.

### Decisions taken (confirmed)

- **Answer chips stay instant.** `handleAnswerChange` (`ApplicationFill/index.tsx:168-178`)
  keeps firing `patchItem` per tap with its optimistic update. Chips are not a form field.
- **zod + `@hookform/resolvers`**, not RHF's built-in `rules`.
- **Confirm before leaving** a dirty form, via `navigation.addListener('beforeRemove')`.

---

## Invariants — must still hold after this change

Called out explicitly because both are load-bearing and easy to break silently:

1. **Optimistic updates.** Every UI write continues to go through
   `src/hooks/useApplicationMutations.ts` with `.withOptimisticUpdate` + `patchAppEverywhere`
   (`:18-53`). RHF owns *pre-submit draft state only*; the moment a form submits, the write
   path is unchanged. Do **not** reintroduce a `useState` buffer for server-rendered data —
   `useApplicationFill.ts` must keep rendering straight from `useQuery`.
2. **Background photo uploads.** Photos are explicitly out of scope. `useAttachPhotos.ts`,
   `src/infra/uploads/upload-store.ts` and `background-task.ts` are untouched. Photos keep
   firing `addAttachment` immediately with `uploadStatus: 'pending'` + `localUri`; durability
   stays in the Convex row, drained by the module-level zustand store. **No photo state ever
   enters an RHF form** — in particular `ItemDrawer`'s photo props stay plain props, and
   `handleAddPhoto` (`ApplicationFill/index.tsx:180-195`), which flushes the note draft before
   navigating to the camera, must keep doing that (it becomes `getValues()` + `patchItem`).

---

## Phase 1 — Dependencies and schemas

```
bun add react-hook-form zod @hookform/resolvers
```

All three are pure JS — **no `expo prebuild` / dev-client rebuild needed** (unlike the
`expo-image-manipulator` step in the previous plan).

New `src/infra/domain/schemas/` — colocated with `src/infra/domain/entities/`, one file per
entity, PT-BR messages lifted verbatim from the current service throws so nothing regresses:

```ts
// src/infra/domain/schemas/checklist.ts
export const checklistFormSchema = z.object({
  title: z.string().trim().min(1, 'Nome do checklist é obrigatório'),
  tagsIds: z.array(z.string()),
  options: z.array(z.object({
    label: z.string().trim().min(1, 'Informe um rótulo'),
    semantic: z.enum(['positivo', 'negativo', 'neutro']),
  })).min(1),
  items: z.array(checklistItemFormSchema).min(1, 'O checklist deve ter ao menos um item'),
})
export type ChecklistFormValues = z.infer<typeof checklistFormSchema>
```

Schemas needed: `checklistFormSchema`, `checklistItemFormSchema` (title required,
description, tagsIds), `applicationMetaSchema` (tagsIds `.min(1, 'Selecione ao menos uma
tag para a aplicação')`, date `.min(1, 'Data da visita é obrigatória')`),
`applicationItemDraftSchema` (note, tagsIds, quantity nullable),
`newApplicationItemSchema` (title required), `tagLabelSchema`.

**Make the schema the single source of truth.** In `src/infra/services/*`, replace the
hand-written `if (...) throw new Error(...)` guards with `schema.parse(input)` — see
`checklist-service.ts:67-72` / `:100`, `:122-124` and `application-service.ts:45-50`, `:244`,
`tag-service.ts:34`. Services keep throwing (imperative callers and the
AsyncStorage→Convex migration still depend on that), but the message now lives in one place.
`useTagsCatalog.ts:38`'s duplicate check goes away. Convex's `v.*` validators are server-side
arg validation and stay as they are — `v.any()` payloads are out of scope here.

---

## Phase 2 — Form adapters

New `src/components/Form/`, following the repo's compound-component convention (same shape as
`Input/`, `ItemCard/`). These are thin `Controller` wrappers — every existing input is already
fully controlled `value`/`onChange`, so each maps cleanly:

| Adapter | Wraps | Notes |
|---|---|---|
| `Form.TextField` | `Input` / `Input.Field` | Maps RHF `onChange` → `onChangeValue`, absorbing the existing `(v: number \| string)` union and the `String(value)` casts at `ChecklistFormView.tsx:134` and `ApplicationFill/index.tsx:765`. Passes `field.onBlur` straight through — `Field.tsx:51-54` already forwards it. Sets `variant="danger"` when `fieldState.error` is set. |
| `Form.SheetTextField` | `SheetAwareTextInput` | For inputs inside bottom sheets (`ChecklistFormView.tsx:220,231`, `ItemDrawer/index.tsx:122`). Must **not** fall back to plain `TextInput` or keyboard handling breaks in sheets. |
| `Form.TagSelect` | `TagMultiSelect` | `selectedIds`/`onChange` → `field.value`/`field.onChange`. Its internal `draftIds`/`commitSelection` (`TagMultiSelect/index.tsx:69,115-119`) stays — it's a sheet-local commit, orthogonal to RHF. |
| `Form.DateField` | `DatePickerField` | `value: string` ISO / `onChange`. |
| `Form.Stepper` | `Stepper` | `value: number` / `onChange`. |
| `Form.ErrorText` | — | Renders `fieldState.error.message` using the existing `styles.error` text style. First per-field error surface in the app. |

Also add `forwardRef` to `Input/components/Field.tsx` (it renders `SheetAwareTextInput`,
which is already `forwardRef` — `SheetAwareTextInput/index.tsx:17-25`) so RHF's
`shouldFocusError` can focus the offending field. Optional but cheap.

`docs/pt/input-guide.md` and `docs/en/input-guide.md` document the `Input` API — add the
`Form.TextField` usage there so they don't go further out of date.

---

## Phase 3 — Unsaved-changes guard

New `src/hooks/useUnsavedChangesGuard.ts`:

```ts
export function useUnsavedChangesGuard(isDirty: boolean, navigation: NavigationProp) {
  const { confirm } = useConfirm() // existing ConfirmBottomSheet
  useEffect(() => navigation.addListener('beforeRemove', (e) => {
    if (!isDirty) return
    e.preventDefault()
    confirm({ message: 'Descartar alterações?', onConfirm: () => navigation.dispatch(e.data.action) })
  }), [isDirty, navigation, confirm])
}
```

Reuse `src/components/ConfirmBottomSheet` rather than `Alert`. Applies to the two full-screen
forms: `ChecklistNew`, `ChecklistEdit`. **Not** to bottom sheets — closing the item drawer
without saving already discards by design, and that stays.

Important: after a successful submit the form must be `reset()` (or the guard skipped via a
ref) *before* `navigation.replace`, or the guard fires on the very navigation the submit
triggered.

---

## Phase 4 — Migrate the forms

Ordered easiest → hardest, each independently shippable.

**4a. `ApplicationNew`** (`src/app/ApplicationNew/index.tsx`) — smallest, do it first as the
pattern reference. Two fields (`tagsIds`, `date`) at `:26-27`. `useForm({ resolver:
zodResolver(applicationMetaSchema), defaultValues: { tagsIds: [], date: todayIso() } })`.
Drops the duplicated validation at `:68/72`. Keeps the fire-and-forget `void
mutations.create(...)` + immediate `navigation.replace` at `:44` — **that optimistic path is
unchanged.**

**4b. `ChecklistDetail` batch tag sheet** (`src/app/ChecklistDetail/index.tsx:59-64`) — one
field. `reset({ tagsIds })` on open replaces `handleOpenBatchEdit:93-100`;
`handleSubmit` replaces the manual check at `:104`. Still one `setTagsForMany`.

**4c. `ApplicationFill`'s three sub-forms** (`src/app/ApplicationFill/index.tsx`). The screen
has 15 `useState` calls at `:70-95`; this removes 7 of them (`editingItemDraft`,
`draftTagsIds`, `draftDate`, `applicationError`, `newItemTitle`, `newItemTagsIds`,
`newItemError`). Three separate `useForm` instances — do **not** merge them into one:

- *Item drawer* → `reset()` in `handleOpenItemDrawer:430-439`, `handleSubmit` on
  `ItemDrawer.onSave`. Deletes the verbose per-field merge at `:659-684`.
  `handleAddPhoto:180-195` becomes `getValues()` → `patchItem` before navigating (preserves
  the existing flush-before-camera behaviour).
- *Meta sheet* → `reset()` in `handleOpenEditApplication:368-373`, `handleSubmit` on
  `handleSaveApplication:375-391`.
- *Add-item sheet* → `reset()` in `handleOpenAddItem:393-398`, `handleSubmit` on
  `handleSaveNewItem:400-429`.

`ItemDrawer`'s 22-prop controlled API (`ItemDrawer/index.tsx:13-35`) can stay as-is —
the screen just feeds it from `Controller`s. Changing it to consume `useFormContext`
internally is a larger refactor; not required, and it would drag photo props into form
context, which the invariants forbid.

**4d. `useChecklistForm` → RHF** — the biggest win and the biggest change. Replace the whole
hook (`src/hooks/useChecklistForm.ts`, 117 lines) with `useForm<ChecklistFormValues>` +
two `useFieldArray`s (`options`, `items`).

- `ChecklistFormApi = ReturnType<typeof useChecklistForm>` is passed as a single `form` prop
  to `ChecklistFormView` — swap it for `UseFormReturn<ChecklistFormValues>` and keep the same
  prop shape, so `ChecklistNew` and `ChecklistEdit` barely change.
- `useFieldArray`'s generated `field.id` replaces the hand-rolled
  `generateId('formitem_')` key (`useChecklistForm.ts:70`) **and** fixes the index-keyed
  options at `ResponseOptionsEditor.tsx:37-38`.
- Reorder: `react-native-reorderable-list`'s `reorderItems` currently feeds `form.setItems`
  (`ChecklistFormView.tsx:181-182`) → use `useFieldArray`'s `move(from, to)`.
- Undo-delete snapshots (`removeOptionWithUndo:73-81`, `removeItemWithUndo:83-91`) →
  `replace(snapshot)`.
- `applyTemplate` (`useChecklistForm.ts:83-95`, called from `ChecklistNew:35`) → `reset(...)`.
- `ChecklistEdit`'s inner-component workaround (`:82-107`) → `reset(checklist)` in a
  `useEffect` on the query result. The split component can collapse back.
- `ResponseOptionsEditor` must take `control` (stable ref) instead of the whole `form`
  object, so its existing `memo()` finally works. Each option label becomes its own
  `Controller` — this is the change that stops one keystroke re-rendering the item list.

**Out of scope:** `Library` search (`:26-28`) and `Overview` filters (`:46-49`). These are
live-derived filter state with no submit step — RHF buys nothing. (The undebounced search at
`Library:46-57` is a real but separate issue.)

---

## Verification

No test infrastructure exists (no jest, no `*.test.*` anywhere), and Biome has
`correctness/noUnusedVariables` **disabled**, so `tsc` is the only static net. Verify
manually:

1. `bun typecheck` and `bun lint` clean. Because `noUnusedVariables` is off, **grep for
   leftover `useState` in each migrated file** — dead draft state will not be flagged.
2. **The core perf check:** React DevTools Profiler → "Highlight updates on render". Open
   `ChecklistNew`, type in an option label. Before: the whole form tree flashes. After: only
   that field. This is the whole point of the change — confirm it visibly.
3. `ChecklistNew`: apply a template → fields populate; add/remove/reorder items and options →
   order persists through save; submit with empty title → per-field error under the title,
   no crash; submit valid → lands in `checklistDetail`.
4. `ChecklistEdit`: open an existing checklist → fields seeded from the query (the
   `reset` path); edit, press back → "Descartar alterações?" confirm; cancel → stays; confirm
   → leaves. Save → navigates with **no** spurious prompt (the reset-before-navigate case).
5. `ApplicationFill` regression sweep, with `npx convex dev` running on a **physical device**:
   - **Answer chips still flip on the next frame with no spinner** and the answered count
     stays consistent — this is the invariant most at risk.
   - Item drawer: type a note, add a photo mid-edit → camera opens, note is not lost on
     return (the `handleAddPhoto` flush).
   - **Photos: thumbnail appears immediately; navigate away mid-upload and come back → still
     there; force-quit mid-upload and relaunch → upload resumes.** Unchanged behaviour, but
     confirm the migration didn't disturb it.
   - Meta sheet with zero tags → "Selecione ao menos uma tag" as a field error; add-item
     sheet with blank title → "Informe um título para o item".
6. Convex dashboard → Functions: mutation **counts per interaction must be identical to
   before** (1 per save, 1 per chip tap). If any count changed, a write path moved by
   accident.
7. Keyboard behaviour inside every bottom sheet (item sheet, item drawer, meta sheet) — the
   `SheetAwareTextInput` vs plain `TextInput` distinction is easy to lose in a `Controller`
   refactor and fails only on device.

---

## Handoff

Per project convention, copy this file to `plan/react-hook-form-forms.md` and cross-reference
`plan/optimistic-updates-background-uploads.md` (whose invariants this plan preserves).

---

## Implementation status: done, with a few deviations from the draft above

All of Phases 1–4 shipped. `bun typecheck` and `bun lint` are clean across the whole repo
(248 files). What actually differs from the plan as drafted:

- **No `Form.Stepper`.** `Stepper` only ever appears embedded inside `ItemDrawer`, which stays
  a single controlled component (per §4c) rather than exploding into per-field `Controller`s.
  The item-drawer form is wired via `watch()`/`setValue()`/`getValues()` against the whole
  `ItemDrawer` props surface, not a `Form.*` adapter. Building an unused wrapper would have
  been speculative.
- **`useUnsavedChangesGuard` doesn't call a `useConfirm()` hook** — no such hook exists in this
  codebase. `ConfirmBottomSheet` is always a plain controlled component owned by local
  `useState` in the screen (confirmed against its actual usage in `ApplicationFill` and
  `ChecklistDetail`). The hook instead returns `{ visible, onCancel, onConfirm }` for the
  screen to render into its own `<ConfirmBottomSheet>`, matching that existing convention.
- **`useFieldArray`'s `keyName` option, not a hand-kept `key` field.** The original
  `ChecklistFormItemState.key` (`generateId('formitem_')`) is now generated automatically via
  `useFieldArray({ ..., keyName: 'key' })`, which avoids the collision that would otherwise
  occur between RHF's own injected identity field (default name `id`) and the checklist item's
  real persisted `id`. `checklistItemFormSchema` therefore has no `key` field — it would fail
  validation, since RHF's injected `keyName` prop is a rendering-time artifact, not part of the
  actual submitted form values.
- **`ResponseOptionsEditor` calls `useFieldArray` itself** (same `control`, same `name:
  'options'` as the parent) instead of receiving `fields` as a prop — this is RHF's documented
  pattern for sharing one field array across components, and keeps the component's only props
  down to `control` (stable) + a `useCallback`-wrapped `onRemoveOption`, which is what actually
  makes its existing `memo()` start working (a prop that's a fresh inline arrow function every
  render would have defeated the memo regardless of the `control`-vs-`form` change).
- **Two `haptics.error()` calls were at risk of silently disappearing** — `ApplicationFill`'s
  meta-sheet and add-item-sheet saves, and `ChecklistFormView`'s item-sheet save, all called
  `haptics.error()` inline right before the old manual validation `return`. Since RHF's
  `handleSubmit` swallows invalid submissions before the submit callback ever runs, this was
  restored via `handleSubmit(onValid, onInvalid)`'s second argument: `handleSubmit(onSave, () =>
  haptics.error())`. Easy to lose in a mechanical port — check for this pattern in any other
  RHF migration in this codebase.
- **`ChecklistEdit`'s reset-from-query effect needed a one-shot guard.** A naive `useEffect(() =>
  { if (checklistData) form.reset(...) }, [checklistData])` re-fires (and silently wipes
  in-progress edits) if the query object reference ever changes after the first load — e.g. a
  background sync from another device. Original `useState`-based code was immune to this
  because `useState`'s initializer only runs once. Fixed with a `useRef(false)` hydrated-once
  flag; the effect is a no-op after the first successful reset.
- **`handleRepeat` in `ChecklistDetail` lost its (already-broken) error path.** It used to call
  the same `setBatchError` the batch-tag-edit sheet uses, but since `handleRepeat` navigates
  away synchronously before the mutation can fail, that error was already never visible to a
  user in practice. Now it's `.catch(() => {})` — same observable behavior, no unhandled
  rejection.
- **Two validation message strings were unified.** `application-service.ts`'s
  `addApplicationItem` threw `'Título do item é obrigatório'` while both UI call sites
  (`ChecklistFormView`, `ApplicationFill`'s add-item sheet) already showed `'Informe um título
  para o item'` for the identical rule. Standardized on the UI copy since nothing else in the
  codebase depended on the exact string (verified by grep).
- **Not done: wiring `Form.TextField`'s `forwardRef` into `Input`/`Root` for
  `shouldFocusError`.** `Input/components/Field.tsx` is now `forwardRef`-capable (the plan's
  "optional but cheap" ask), but the ref isn't threaded through the legacy `Input` component's
  `Root`/`Icon`/`Prefix`/`Suffix` composition, so `shouldFocusError` auto-focus doesn't
  actually work yet. Skipped as genuinely optional and out of proportion to thread through the
  whole compound-component chain for a nice-to-have.

### Verification actually performed

- `bun run typecheck` and `bun run lint` across the full project: clean, before and after every
  phase (compared against the pre-change baseline to rule out pre-existing errors in
  `reports/` and `UndoToast` being mistaken for regressions).
- Manual read-through diff review of every changed file.
- Grepped every migrated file for leftover `useState`/stale variable references — none found.

### Not verified — needs a human on a device

Everything in the plan's Verification steps 2–7 requires a physical device running
`npx convex dev` (React DevTools Profiler, on-device keyboard/sheet behavior, upload
resumption, Convex dashboard mutation counts) or was otherwise out of reach in this
environment. This work should be treated as **implemented, not yet device-verified**.
