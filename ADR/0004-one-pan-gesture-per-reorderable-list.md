# 0004 — One pan gesture instance per reorderable list

- **Status**: Accepted
- **Date**: 2026-09-18
- **Affects**: `src/hooks/useReorderablePanGesture.ts`, both `*ItemGroupSection.tsx`

## Context

Both screens created one pan gesture at the screen root and passed the same object to every section:

```tsx
const panGesture = useReorderablePanGesture()      // screen
...
groups.map((group) => <ItemGroupSection panGesture={panGesture} ... />)
```

The prop was documented as *"shared across every section so only one pan gesture is ever mounted for
the whole screen"*. That is not what the prop does.

`ReorderableListCore` takes the instance you hand it and **chains configuration onto it**:

```js
// react-native-reorderable-list/lib/module/components/ReorderableListCore.js
const panGestureHandler = useMemo(
  () => (panGesture || Gesture.Pan())
    .onBegin(e => { 'worklet'; /* writes startXY, currentXY, dragXY, gestureState */ })
    .onUpdate(e => { 'worklet'; /* writes dragXY, currentXY, ... */ })
    .onEnd(...)
    .onFinalize(...),
  [panGesture, state, startXY, currentXY, /* ...this list's own shared values */],
);
```

RNGH's builder methods mutate in place and return `this`
(`react-native-gesture-handler/src/handlers/gestures/gesture.ts` — each setter assigns to
`this.handlers` and ends in `return this`). So with one shared instance:

1. Every list overwrites the previous list's `onBegin`/`onUpdate`/`onEnd`/`onFinalize` with worklets
   closing over **its own** shared values. The last list mounted wins; every other list drives the
   wrong state.
2. `attachHandlers` writes `handlerTag` onto the gesture object per detector, so N `GestureDetector`s
   fight over one tag (see [0003](0003-never-unmount-collapsed-content.md)).

The library's README shows one `useMemo`'d instance per list, never a shared one.

## Decision

`useReorderablePanGesture()` is called **inside the component that renders the list**, once per list:

```tsx
// ApplicationItemGroupSection.tsx / ChecklistItemGroupSection.tsx
// One instance per list - the list mutates it (see useReorderablePanGesture).
const panGesture = useReorderablePanGesture()
```

The `panGesture` prop is gone from both section components, and the screens no longer create one.
The hook's doc comment states the constraint so the next person doesn't hoist it back.

## Consequences

- Each list drives its own shared values. Dragging in one group no longer perturbs another.
- Each gesture gets its own handler tag.
- The activation-delay contract is unchanged and still load-bearing:
  `DRAG_PAN_ACTIVATION_DELAY` (900ms) must stay longer than `DRAG_LONG_PRESS_DELAY` (520ms) so the
  row's `Pressable.onLongPress` wins the race and calls `drag()` before the native pan activates.
- N gestures now exist instead of 1. They attach once each (content never unmounts —
  [0003](0003-never-unmount-collapsed-content.md)), so this is not per-toggle work.

## Note

This change alone did not fix the drag-and-drop regression seen during this work — that was
[0003](0003-never-unmount-collapsed-content.md). It is kept because it is independently correct:
sharing a mutated gesture across lists is a latent state-corruption bug whether or not it is
currently visible.
