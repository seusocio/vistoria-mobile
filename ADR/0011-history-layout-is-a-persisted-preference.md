# 0011 — The history layout is a persisted preference, not a screen state

- **Status**: Accepted
- **Date**: 2026-09-23
- **Affects**: `src/lib/preferences/`, `src/components/ApplicationRow/`,
  `src/features/checklist/checklist-detail/`
- **Extends**: [0010](0010-collapsible-card-variant.md)

## Context

A throwaway prototype put six layouts for the checklist histórico on the real screen behind a route
param (see the git history for `checklist-detail/prototype/`). Two survived review: the shipped
`detailed` card, and a `dense` one — no marker, no subtitle, the group's actions as header icons,
visits as tight rows with the negatives count as a bare number. Roughly twice the visits per screen,
at the cost of a 15pt icon being a much smaller target than a labelled button.

Neither is correct for everyone. `detailed` reads without being learned; `dense` is better once you
already know the data. That is a user preference, not a decision to make on their behalf.

## Decision

**The two layouts are separate components behind one public one.**

`ApplicationRow` takes a `layout` prop and dispatches to `DetailedCard` or `DenseCard`. They agree
on the card shell (`sharedStyles`, and `Collapsible`'s `card` variant from
[0010](0010-collapsible-card-variant.md)) and on the data, and disagree about the header, the rows,
and where the group's actions live. One component branching on a prop through all three would be two
components wearing a trench coat.

`memo` lives on the public `ApplicationRow` **only**. Both layouts are reached through it, so
memoizing them too is a second comparison of props the first already found equal.
[0008](0008-memoization-contract-for-sections-and-rows.md) still governs what those props must
satisfy: `layout` is a string, and the callbacks were already keyed rather than bound per row.

**The choice is persisted, in its own store.**

`usePreferences` (zustand + `persist` + AsyncStorage, the same shape as the outbox in
[0009](0009-offline-queue-as-the-only-write-path.md)) holds it under `@vistoria/preferences`.

It is deliberately **not** in the offline queue. Nothing here is data: losing the whole store costs
the user one tap. It is persisted only because a display choice that resets every launch reads as a
bug. The queue is for writes that must survive a process kill, and putting a display toggle in it
would blur that line for no gain.

## The hydration frame

AsyncStorage is read asynchronously, so **the first render always sees the default**, whatever was
saved. Rendering straight away means a `dense` user gets one frame of `detailed` and a visible
re-layout on every cold start.

`useHasHydratedPreferences` subscribes to `persist.onFinishHydration` (the pattern
`use-online-status.ts` already uses), and `checklist-detail.container` folds it into the `loading`
it already returns:

```ts
loading: loading || !checklist || !preferencesReady
```

The screen has a skeleton for that state already, and Convex/offline-queue data is normally the
slower of the two, so in practice this costs nothing — it just makes the flash impossible rather
than unlikely.

## Consequences

- A third layout is a third component plus one entry in `HistoryLayout`. It is not a `style` prop
  on `ApplicationRow`, for the reasons in [0001](0001-collapsible-compound-component.md).
- `ApplicationRowEntry` grew an optional `status`. Only the dense layout draws a per-visit tick from
  it; the detailed layout still shows status for the group as a whole.
- Any screen can read `historyLayout`. If a second screen ever renders these cards, it must pass the
  preference too, or the app will disagree with itself about a choice the user made once.
- The toggle is labelled with the layout that is **on**, not the one a tap switches to. A toggle
  naming its destination reads as a statement about the present every time.
- The prototype is gone from main: `checklist-detail/prototype/`, `PrototypeSwitcher`, the
  `variant` route param and the container's `onSelectPrototypeVariant` were all deleted.
