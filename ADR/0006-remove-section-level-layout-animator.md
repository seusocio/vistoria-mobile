# 0006 — Remove the section-level layout animator, keep the per-cell one

- **Status**: Accepted (amended 2026-09-18, see *Correction* below)
- **Date**: 2026-09-18
- **Affects**: both `*ItemGroupSection.tsx`, `src/components/Collapsible/constants.ts`

## Context

A section used to run three animations over the same measurement at the same time:

```tsx
<Animated.View layout={LinearTransition.duration(220)}>   {/* 1 */}
  <GroupHeader ... />
  <Collapsible expanded={expanded}>                        {/* 2: animates height */}
    <NestedReorderableList
      itemLayoutAnimation={COLLAPSIBLE_TRANSITION}         {/* 3: per cell */}
      ...
    />
  </Collapsible>
</Animated.View>
```

1. The **section wrapper's `layout`** snapshots and animates its entire subtree on every layout
   pass, and the subtree is the whole list. It is also redundant: the content's own height animation
   already reflows every sibling below it. Two animators chasing the same measurement means the
   wrapper spends the whole 220ms lagging behind the height animation it is watching.
2. The **height animation** is the one that actually opens the section.
3. **`itemLayoutAnimation`** registers every cell with Reanimated's layout-animation manager
   (`ReorderableListCell.js` renders `<Animated.View ... layout={itemLayoutAnimation.current}>`).

Meanwhile `Collapsible` drove its height with `withTiming` *inside* `useAnimatedStyle`, keyed on a
shared value written from `onLayout`. Any layout change restarted a fresh animation from wherever
the previous one had reached.

## Decision

Remove **(1)** only. Keep (2) and (3).

- The section-level `Animated.View layout={LinearTransition}` wrapper is removed from both sections.
  `Collapsible.Root` renders no host view at all
  ([0001](0001-collapsible-compound-component.md)), so the header and content are direct children of
  the screen's existing column.
- The height is `measuredHeight.value * openness.value`
  ([0002](0002-measure-collapsible-content-out-of-flow.md)) — no `withTiming` recomputed inside the
  worklet.
- `itemLayoutAnimation={COLLAPSIBLE_ROW_TRANSITION}` **stays on both lists**. See the correction.
- `COLLAPSIBLE_DURATION_MS` (180ms) is the single timing for the whole accordion — chevron, height
  and row transitions. A chevron that finishes before or after the section it belongs to reads as
  two unrelated animations.

## Correction

**This ADR originally removed `itemLayoutAnimation` as well, on the stated grounds that it was
"for add/remove only" while drags were animated by the library's own `itemTranslateXY`. That was
wrong, and it shipped.**

Reanimated's `layout` animates **any** layout change, not just mount and unmount. On the fill screen
that includes the most common interaction on the entire screen: confirming an item sinks it to the
end of its group —

```js
// ApplicationFill/index.tsx, the `groups` memo
// Completed items sink to the end of their own group's list instead
// of moving to a separate section...
children: [...incomplete, ...completed],
```

— and `itemLayoutAnimation` is what slid the row down. Without it the row teleports to the bottom
the instant you tap the status dot. It was load-bearing feedback for a confirm action, not
decoration.

It is restored on **both** lists: on `ApplicationFill` for the completion reflow, and on
`ChecklistForm` because adding an item, removing one, and restoring one from the undo toast all
shift the rows below them.

The general lesson is the same one as [0003](0003-never-unmount-collapsed-content.md): an animation
that looks like polish may be the only feedback a state change has. Identify what a thing does
before deciding it costs more than it is worth — and a cost you have not measured is not a reason to
remove behaviour a user relies on.

## Consequences

- Sections below an opening one still slide, because the animating height reflows them each frame.
  That was always true; the section wrapper was not what produced it.
- Per-cell layout registration cost remains and scales with group size. It is being paid for
  something real.
- **Unverified**: that removing the section wrapper measurably improves frame time. The redundancy
  is read from source and is real; the size of the win is not measured.

## Known remaining cost

Animating the height of an `overflow: hidden` container makes the native side re-clip that subtree
every frame, so the 180ms open/close is inherently proportional to the number of rows in the
section. That cost is *not* addressed here and cannot be memoized away. If open/close still does not
feel right, the lever is the animation itself — shorten it, or skip the height animation above some
row count. That is a product decision, not a refactor, and it should be made from a profile rather
than from reasoning.
