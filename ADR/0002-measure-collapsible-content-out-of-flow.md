# 0002 — Collapsible height is measured from an out-of-flow child

- **Status**: Accepted
- **Date**: 2026-09-18
- **Affects**: `src/components/Collapsible/Content.tsx`, `src/components/Collapsible/styles.ts`

## Context

To animate a section open you need its natural height, and you only learn that by laying the content
out. The obvious structure is:

```tsx
<Animated.View style={[clip, { height: measured * openness }]}>   {/* overflow: hidden */}
  <View onLayout={handleLayout}>{children}</View>
</Animated.View>
```

This does not work here, and the failure is silent: **the chevron animates, and nothing opens.**

The content of a section is a `NestedReorderableList`, which renders an
`Animated.createAnimatedComponent(FlatList)` — a real `ScrollView`
(`react-native-reorderable-list/lib/module/components/ReorderableListCore.js`, `AnimatedFlatList`).
A `ScrollView` in a parent pinned to `height: 0` sizes itself to zero. `onLayout` then reports `0`,
so `measured` stays `0`, so `height = 0 * openness` is always `0`, forever. The section can never
measure itself open.

`overflow: hidden` is not the problem — it only clips drawing. The explicit `height` on the parent is.

The first version of this component worked around it by not clipping until after a first
measurement pass, which forced it to leave content mounted permanently and led to the wrong
conclusion recorded in [0003](0003-never-unmount-collapsed-content.md).

## Decision

The measured child is taken out of flow:

```ts
// src/components/Collapsible/styles.ts
measured: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
},
```

An absolutely positioned node resolves its width from `left`/`right` against the parent, and leaves
its height `auto` — driven by content, **independent of the parent's height**. The FlatList lays out
at its natural size and reports a real height no matter what the container is clipped to, while the
parent's animated height does the reveal.

The height itself is `measuredHeight.value * openness.value`, not a `withTiming` recomputed from a
shared value inside the worklet. Content that grows while open (an item added, a title wrapping to
two lines) then resizes instantly rather than kicking off a fresh animation from wherever the last
one had got to.

## Consequences

- The container has **no intrinsic height**. It is entirely driven by the animated style. If
  `measuredHeight` ever stays `0`, the section renders as empty rather than degrading to auto
  height. There is no fallback — this is the known sharp edge of the approach.
- Do not "simplify" `styles.measured` away, and do not put an explicit height on
  `Collapsible.Content`. Either brings the silent-never-opens bug straight back.
- Content is revealed downward from the top, which is the behaviour we want for an accordion.
- Height is re-read on every layout of the child, so a section that changes size while open follows
  along without a re-animation.

## Known limitation

A `FlatList` reports its height once the cells it has decided to render are laid out. If it renders
in more than one batch, the first `onLayout` reports a short height and the section opens to the
wrong size before correcting. [0007](0007-single-pass-render-for-non-scrolling-lists.md) forces a
single render pass, which avoids this for these lists — the two decisions depend on each other.
