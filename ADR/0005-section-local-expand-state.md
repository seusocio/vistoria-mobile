# 0005 — Expand/collapse state is owned by the section

- **Status**: Accepted
- **Date**: 2026-09-18
- **Affects**: `src/app/ApplicationFill/index.tsx`, `src/app/ChecklistForm/ChecklistFormView.tsx`, both `*ItemGroupSection.tsx`

## Context

Both screens held the open/closed state of every section at the screen root:

```tsx
// ApplicationFill/index.tsx
const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set())
const toggleGroup = useCallback((groupKey: string) => { /* copy the Set, add/delete */ }, [])
```

```tsx
// ChecklistFormView.tsx
const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set())
```

Grepping each screen for those identifiers turns up exactly three uses: the declaration, the
toggler, and one expression handing the boolean straight back down —
`expanded={expandedGroupIds.has(group.key)}`. **Nothing else on either screen reads it.**

So tapping a header set state at the screen root and re-rendered the whole screen. On
`ApplicationFill` that is the tags row, progress bar, gallery header, `ApplicationGallery`,
`VoiceCard`, the items header, the `groups.map`, the item drawer and the photo viewer — to flip one
boolean inside one section. The memoized sections bailed out correctly
([0008](0008-memoization-contract-for-sections-and-rows.md)); everything else on the screen did not,
because none of it is memoized and none of it needs to be for any other reason.

This is the cost that shows up as "laggy when opening and closing collapsibles", and it scales with
the size of the screen, not with the number of items in the group being toggled.

## Decision

Each section owns its own state:

```tsx
// ApplicationItemGroupSection.tsx — starts collapsed
const [expanded, setExpanded] = useState(false)
const handleToggle = useCallback(() => setExpanded((current) => !current), [])
```

```tsx
// ChecklistItemGroupSection.tsx — starts expanded
const [expanded, setExpanded] = useState(true)
```

Both screens lost the `Set`, the `toggleGroup` callback, and the `expanded` / `groupKey` /
`onToggle` props. `ApplicationFill` keeps a comment at the callback-stabilisation block noting that
expand/collapse is deliberately *not* there.

## Consequences

- A toggle re-renders one section. The screen root is untouched.
- State is keyed by React element identity. Both screens render sections with
  `key={group.key}` / `key={groupKey}`, so state survives re-renders and follows a group as the
  items around it change — the same guarantee the keyed `Set` gave.
- A group that disappears and comes back (all its items renamed out of the prefix, say) returns to
  its default state. This matches the previous behaviour, where its key would have dropped out of
  the `Set`.
- **If a future feature needs screen-level control** — "expand all", or auto-opening the group
  containing a searched-for item — do *not* simply lift this back to a `useState` at the root. Put
  it somewhere sections can subscribe to individually (a store, or context with a per-section
  selector), or the re-render cost documented above comes straight back.
- `Collapsible.Root` remains a *controlled* component (`expanded` + `onToggle`). Ownership moved;
  the component API did not change.
