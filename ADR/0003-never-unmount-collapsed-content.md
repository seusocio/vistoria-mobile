# 0003 — Collapsed content is lazy-mounted once and never unmounted

- **Status**: Accepted
- **Date**: 2026-09-18
- **Affects**: `src/components/Collapsible/Content.tsx`
- **Supersedes**: an earlier attempt, shipped and reverted the same day, that unmounted on close

## Context

A collapsed group looks like it should cost nothing. Each row carries a `Pressable`, a reorderable
cell with two `useAnimatedReaction`s and an animated style, and a set of worklets; leaving ten of
them mounted behind a zero height means every unrelated re-render still walks them. Unmounting on
close is the obvious win.

**It was tried, and it broke drag-and-drop.**

### Why

`ScrollViewContainer` creates a *single* gesture instance and shares it by context:

```js
// react-native-reorderable-list/lib/module/components/ScrollViewContainer.js
const outerScrollGesture = useMemo(() => Gesture.Native(), []);
```

That one object is attached to the container's own `GestureDetector` **and** composed into every
nested list's gesture:

```js
// ReorderableListCore.js
const combinedGesture = useMemo(() => {
  if (outerScrollGesture && !(Platform.OS === 'android' && scrollable)) {
    return Gesture.Simultaneous(outerScrollGesture, gestureHandler);
  }
  return gestureHandler;
}, [scrollable, outerScrollGesture, gestureHandler]);
```

And gesture handlers are registered per-detector against the gesture *object*:

```tsx
// react-native-gesture-handler/src/handlers/gestures/GestureDetector/index.tsx
useIsomorphicLayoutEffect(() => {
  preparedGesture.isMounted = true;
  attachHandlers({ preparedGesture, gestureConfig, gesturesToAttach, webEventHandlersRef, viewTag });
  return () => {
    preparedGesture.isMounted = false;
    dropHandlers(preparedGesture);
  };
}, []);
```

`attachHandlers` writes the handler tag onto the gesture object; `dropHandlers` tears it down. So
mounting or unmounting a nested list re-registers a gesture that the **outer ScrollView is still
using**. Dragging stops working, and every toggle pays for the re-attachment across every section.

This is inherent to how the library shares `outerScrollGesture`. We cannot unmount a
`NestedReorderableList` on a whim.

## Decision

`Collapsible.Content` **lazy-mounts on the first open and never unmounts.** Closing clips the
content away; it does not tear it down.

```tsx
/** Latches true on the first open and never goes back. */
const [mounted, setMounted] = useState(expanded)
```

The close animation has no completion callback — there is nothing to unmount.

## Consequences

- A group that has **never been opened** still costs nothing. On `ApplicationFill`, where every
  section starts collapsed, that is the case that actually matters.
- A group that has been opened once keeps its rows mounted for the life of the screen, clipped to
  zero height. We accept that cost; it buys working drag-and-drop.
- Because `measuredHeight` survives, reopening animates immediately with a correct height and no
  measuring pass.
- Clipped rows do not receive touches (`overflow: hidden` on the container).
- **Do not add an unmount-on-close here.** It reads as free memory and is not. If you need it, the
  prerequisite is getting `react-native-reorderable-list` to stop sharing one `Gesture.Native()`
  across detectors — an upstream change, not a local one.

## Lesson

The first version of this component carried a comment asserting that unmounting rows was what made
the screen laggy. That was backwards as stated, so it was reversed — and reversing it broke
dragging, for a reason that had nothing to do with render cost and everything to do with gesture
registration. The original author had the right behaviour for a reason they had not identified.

Mechanism before optimisation. If you cannot name what the cost *is*, do not trade a working
behaviour for it.
