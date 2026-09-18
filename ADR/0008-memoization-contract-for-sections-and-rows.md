# 0008 — Sections and rows have an explicit memoization contract

- **Status**: Accepted
- **Date**: 2026-09-18
- **Affects**: both `*ItemGroupSection.tsx`, both `*ItemRow.tsx`, `ChecklistFormView.tsx`

## Context

Rows were wrapped in `memo()` and the memo could never hold, because the props changed identity on
every render:

```tsx
// ChecklistItemRow — every one of these is new on every parent render
labels={resolveLabels(item.tagsIds)}        // new array
onEdit={() => onEdit(item.key)}             // new closure
onRemove={() => onRemove(item.key)}         // new closure
```

```tsx
// both sections — new function identity, so the list rebuilds every cell
renderItem={({ item, index }) => <Row ... />}
```

```tsx
// ApplicationItemRow — new array and new object literal per render
style={[styles.rowContainer, suggested && { backgroundColor: colors.blue.tint }]}
shellStyle={transcriptSuggestion ? { padding: 6, paddingBottom: 0, ... } : undefined}
```

`ChecklistItemGroupSection` was not memoized at all, and `ChecklistFormView` handed each section four
fresh closures per render. Net effect: any state change anywhere on the form re-rendered every
section and every row in it.

## Decision

A component that is memoized must be given props that can actually compare equal. Concretely:

**1. Callbacks are keyed by the thing they act on, not bound per row.**

```tsx
onEdit: (key: string) => void          // not: () => void, one closure per row
onReorder: (fromKey: string, toKey: string) => void
```

The row does `useCallback(() => onEdit(item.key), [onEdit, item.key])` internally. One stable
instance from the parent serves every row.

**2. Derived values are computed inside the memoized component, not passed in.**

`ChecklistItemRow` takes the stable `resolveLabels` and does
`useMemo(() => resolveLabels(item.tagsIds), [resolveLabels, item.tagsIds])`, rather than receiving a
freshly-built array.

**3. `renderItem` is always a `useCallback`.**

**4. Dynamic styles are `StyleSheet` entries or `useMemo`d, never inline literals.**
`ApplicationItemRow.styles.ts` gained `suggestedRow` and `suggestionShell` for exactly this.

**5. Where the parent legitimately rebuilds its data every render, the comparator gets one extra
level of depth** — `ApplicationItemGroupSection` keeps its custom `arePropsEqual`, which splits
`groupItems` out and compares it element-wise with `shallow()`, because `ApplicationFill` rebuilds
`groups` on every answer tap while the item objects keep their identity.

**6. Where the parent memoizes its data, a plain `memo()` is enough** —
`ChecklistItemGroupSection`, because `ChecklistFormView` memoizes `groups` on `itemsArray.fields`.

**7. Callbacks that need fresh data but must stay stable read it through a ref.**

```tsx
// ChecklistFormView — itemsArray is rebuilt by RHF; closing over it would hand
// every row a new callback on every render and defeat their memo() entirely.
const itemsArrayRef = useRef(itemsArray)
itemsArrayRef.current = itemsArray
```

`openEditItemByKey`, `removeItemByKey` and `reorderItemsByKey` are then `useCallback`s that stay
stable for the life of the screen.

## Consequences

- Answering one item, or opening a sheet, no longer re-renders every row on the screen.
- The contract is a standing obligation. Adding a prop to a memoized section or row means checking
  it is stable — an inline arrow or object literal silently turns the `memo()` back into dead weight
  and nothing will fail to compile.
- The ref-assignment-during-render pattern in `ChecklistFormView` is the standard "latest value" ref.
  It is safe for these callbacks (they only fire from user interaction, long after commit) but it is
  not a pattern to spread without thought under concurrent rendering.
- `ApplicationItemGroupSection`'s `arePropsEqual` compares *all* remaining props via `shallow()`
  on the rest object, so props added later are covered automatically — but a new prop that is an
  object or array rebuilt each render will break it silently. See point 5.
- **Unverified**: the frame-time improvement. The broken memos were read directly from the code and
  are unambiguous; the size of the win is not measured.
