# 0010 — A bar variant, not a second accordion

- **Status**: Accepted
- **Date**: 2026-09-22
- **Affects**: `src/components/Collapsible/`, `src/components/ApplicationRow/`
- **Extends**: [0001](0001-collapsible-compound-component.md)

## Context

[0001](0001-collapsible-compound-component.md) pulled the accordion on **ChecklistForm** and
**ApplicationFill** into one compound component and deleted the two drifted copies of its header and
row styles. It missed a third copy: `ApplicationRow`, the history list on **ChecklistDetail**, which
is also an accordion and was written independently.

It had drifted further than the two that were merged, because nothing about it looked shared:

| | Collapsible | ApplicationRow |
|---|---|---|
| open/close | `height * openness`, Reanimated | `AnimatePresence` + `MotiView` opacity/translateY |
| collapsed content | lazy-mounted once, never unmounted ([0003](0003-never-unmount-collapsed-content.md)) | unmounted on close |
| chevron | `chevron-right`, rotates to 90° | swaps `chevron-down` ⇄ `chevron-up` |
| duration | `COLLAPSIBLE_DURATION_MS` (180) | `180`, written out |

Two accordions in one app, opening at the same speed by coincidence and in two different ways.

The reason it was written separately is real, though: this one is **a card in a list**, not a
section of a full-bleed list. The card draws its own background and edges, and `Collapsible.Header`
draws an opaque background and a hairline rule beneath it — put one inside the other and every edge
doubles up. It also carries a second line (`3 vistorias • Concluída`) and a leading marker, neither
of which `Collapsible.Header` had a slot for.

## Decision

`Collapsible.Root` takes a `variant`, and the difference between the two bars is spelled out once in
`Collapsible/styles.ts`:

- `section` (default) — the full-bleed list section: opaque bar, hairline rule, its own padding.
  The accordion is the only thing on that stretch of screen, so it draws its own edges.
- `card` — the accordion *is* the card. `headerCard` drops background and rule; the card supplies
  them. It **keeps** the base 20/14 padding: the card itself has none, so the bar's own padding is
  what makes the press target span the full width. The title steps down from `cardTitle` to
  `itemTitle`: a card is an item in a list, not a heading over one, and at 14 a long tag join
  (`Sala A · Térreo · Bloco 2`) survives `numberOfLines={1}`.

`Collapsible.Header` grows two slots alongside the existing trailing `children`: `leading` (the
marker) and `subtitle` (a node, because its emphasis — a status tone, a count — is the screen's; the
stacking is ours). With a subtitle, `flex: 1` moves from the title to the column wrapping both —
on a Text inside a column it would stretch the text vertically instead of filling the bar.

Everything else — the animation, the chevron, the timing, the lazy-mount-once contract — is now the
same object on all three screens.

## Consequences

- `ApplicationRow` no longer imports `moti`. The remaining Moti users are unrelated
  (`UndoToast`, `ProgressBar`, `SyncStatusBar`, `VoiceCard`, `Screen`).
- **A history card's body now stays mounted after its first open**, per
  [0003](0003-never-unmount-collapsed-content.md). On this screen the trade is smaller than on
  `ApplicationFill` — a body is a handful of `Pressable`s, not a reorderable list — and groups after
  the first start collapsed, so an unopened card still costs nothing. It is not free, and it is the
  price of one accordion instead of two.
- The card's `gap: 12` is gone. On the card it held a 12pt hole open under a collapsed header,
  because the content is now clipped rather than unmounted; the body's children carry their own
  padding instead.
- The chevron changes direction rather than swapping glyphs, matching the other two screens. This is
  a deliberate visual change, not an oversight.

## The card is full-bleed

Once it stopped being an accordion of its own, the card stopped needing to look like a box.

The gutter moved **off** the list (`listContent` no longer sets `paddingHorizontal`) and **onto**
each row that draws it — `ChecklistDetailHeader`, the empty state, and every row inside the card. A
row padded to 20 can highlight to the screen edge on press; a row inside a card inset by 16 can
only ever light up a strip floating in the middle of one. That is the whole reason the padding sits
where it does, and moving it back up to a shared container quietly undoes it.

- 20, not the 16 the list used, because 20 is the app's gutter (`Screen`'s nav row, the Collapsible
  section bar — 24 call sites against 3). A card title now lands on the same vertical rule as the
  screen title above it.
- The card keeps only `borderBottomWidth: hairlineWidth`: no radius, no side borders, no side
  gutter. `ItemSeparatorComponent` is gone with it — a separator leaves the last card in the list
  with no bottom edge, a self-closing card does not.
- Pressed rows tint (`gray[100]`) instead of fading. At full width `opacity` dims the hairlines
  bounding the row too, and the card flickers as a whole.
- The "Nova aplicação" button is the one thing deliberately **not** full-bleed — `marginHorizontal:
  20`. A button that runs to the screen edge stops reading as a button.
- The leading marker's tag icon, commented out at some point, is back. It was a 34×34 empty blue
  square holding a slot open for nothing.
- A screen that wants a third bar adds a variant here. It does not pass a `style` that re-describes
  the header — that is what [0001](0001-collapsible-compound-component.md) exists to prevent, and
  this ADR is what happens when a fourth copy is found instead of written.
