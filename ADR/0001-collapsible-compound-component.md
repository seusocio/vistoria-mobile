# 0001 — The accordion owns its header, row and title design

- **Status**: Accepted
- **Date**: 2026-09-18
- **Affects**: `src/components/Collapsible/`, `src/app/ChecklistForm/components/`, `src/app/ApplicationFill/components/`

## Context

`Collapsible` started as a single component that took `expanded` and `children` and did nothing but
animate a height. Everything visual around it was re-declared per screen:

- `ChecklistItemGroupHeader.tsx` and `ApplicationItemGroupHeader.tsx` each declared their own
  `container` / `title` / `count` styles plus their own chevron rotation.
- `ChecklistItemRow.styles.ts` and `ApplicationItemRow.styles.ts` each declared the same override of
  `ItemCard`'s default card look — transparent background, no border, bottom hairline, radius 0,
  20/12 padding — under the same comment, written twice.

The two copies had already drifted:

| | Checklist | Application |
|---|---|---|
| header background | `'white'` | *(none — transparent)* |
| header bottom border | `borderBottomWidth: 1` | `borderBottomWidth: 1` |
| row bottom border | `StyleSheet.hairlineWidth` | `StyleSheet.hairlineWidth` |

So a header sat on a 1pt rule while the rows beneath it used sub-pixel hairlines, and one screen's
header was opaque while the other's was not. Nobody decided that; it is what two copies do.

These pieces are never used apart. A header without content below it is not an accordion, and these
rows only ever appear inside one.

## Decision

`Collapsible` is a compound component, and it owns the design of everything in a section:

```
Collapsible.Root         context (expanded, toggle) — renders no host view
Collapsible.Header       the bar: press target, title, chevron
Collapsible.HeaderCount  the count slot ("12", "3/8"), with a `complete` tone
Collapsible.Content      the animated, clipping container (see 0002, 0003)
Collapsible.Row          ItemCard.Root already wearing the flat full-bleed row look
Collapsible.RowTitle     ItemCard.Title in the row weight that pairs with the header title
```

One `src/components/Collapsible/styles.ts` holds the header bar, the row shell and the row title.

Screens compose the pieces and contribute **only what is genuinely theirs**:

- `ApplicationItemGroupHeader` adds a tappable `CircularProgress` as a child of `Collapsible.Header`.
- `ApplicationItemRow` adds a `suggestedRow` background tint and a suggestion shell.

`Collapsible.Root` deliberately renders no host view — header and content are siblings in whatever
column the screen already has, so a section costs exactly the views it draws.

## Consequences

- Deleted: `ChecklistItemGroupHeader.tsx`, `ChecklistItemRow.styles.ts`.
- `ApplicationItemGroupHeader.tsx` is now a thin composition over `Collapsible.Header`.
- `ApplicationItemRow.styles.ts` keeps only what is specific to an application row
  (`suggestedRow`, `suggestionShell`, `titleRow`, `statusLabel`, `completedContent`).
- A screen that wants to restyle the bar or the row is now doing something wrong. Change
  `Collapsible/styles.ts`, or add a variant to the compound component — do not pass a `style` that
  re-describes the container. `Collapsible.Row`'s `style` prop is typed and documented for *state
  tints only*.
- `Collapsible` now imports `ItemCard`. This is a one-way dependency (`ItemCard` knows nothing about
  `Collapsible`) and must stay that way.
