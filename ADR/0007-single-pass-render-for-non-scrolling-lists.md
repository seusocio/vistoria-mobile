# 0007 — Non-scrolling nested lists render in a single pass

- **Status**: Accepted
- **Date**: 2026-09-18
- **Affects**: both `*ItemGroupSection.tsx`

## Context

Each section renders a `NestedReorderableList` with `scrollable={false}` and `scrollEnabled={false}`,
nested inside the screen's outer `ScrollViewContainer`. These lists **never scroll**: every row is
mounted and on screen whenever the section is open.

`FlatList` does not know that. It still applies its default `initialNumToRender={10}`.

So opening a group of twelve:

1. renders ten rows,
2. fires `onLayout` on the measured wrapper — which reports the height of **ten** rows,
3. starts the open animation toward that height
   ([0002](0002-measure-collapsible-content-out-of-flow.md)),
4. renders the remaining two in a second, asynchronous batch,
5. fires `onLayout` again with the real height, moving the target mid-animation.

The reported symptom was performance trouble on *"groups with more than 10 items"*. The threshold
being exactly ten is the tell: it is `initialNumToRender`, not a gradual scaling effect.

Virtualization buys nothing here — nothing is ever clipped away, `removeClippedSubviews` is forced
`false` by the library — so the batching is pure cost plus a visible correctness wobble.

## Decision

Render the whole list in one pass:

```tsx
<NestedReorderableList
  data={items}
  scrollable={false}
  scrollEnabled={false}
  panGesture={panGesture}
  // This list never scrolls, so every row is mounted regardless and
  // virtualization only costs. Left at the default 10, opening a group of 12
  // renders ten rows, measures, animates open, then renders the rest in a
  // second async batch - which is exactly why the trouble started at
  // "more than 10 items". One pass instead.
  initialNumToRender={items.length}
  ...
/>
```

## Consequences

- One layout pass, one measurement, one animation target. Removes the mid-animation height jump
  described in [0002](0002-measure-collapsible-content-out-of-flow.md)'s known limitation.
- The cost of opening a group is paid entirely in the frame that opens it, rather than smeared
  across two. For a very large group this makes that one frame heavier, not lighter. These lists
  cannot scroll, so the rows were going to be rendered regardless — but if a checklist ever grows to
  hundreds of items *in a single group*, this is the line to revisit, and the real answer then is a
  scrollable list rather than a tuned non-scrollable one.
- This only holds while the lists are non-scrolling. **If `scrollable` or `scrollEnabled` is ever
  turned on for these lists, remove `initialNumToRender` at the same time** — it would then defeat
  virtualization that is actually doing something.
- **Unverified**: that this is *the* fix for the reported lag. The batching behaviour and the
  threshold match the report exactly, which is why it was changed, but no profile was taken.
