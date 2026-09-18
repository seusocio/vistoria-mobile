import { LinearTransition } from 'react-native-reanimated'

/**
 * Open/close duration for Collapsible.Content, and the only timing any part of
 * an accordion should use - a header chevron that finishes before or after the
 * section it belongs to reads as two unrelated animations.
 *
 * Kept short deliberately. Animating the height of a clipping container forces
 * the whole clipped subtree to be re-composited every frame, so the cost of
 * this animation scales with the number of rows in the section.
 */
export const COLLAPSIBLE_DURATION_MS = 180

/**
 * Layout transition for the rows inside a Collapsible.Content, for the
 * enclosing list's `itemLayoutAnimation`.
 *
 * This is not decoration. Reanimated's `layout` animates any layout change, so
 * on the fill screen - where confirming an item sinks it to the end of its
 * group (see the `groups` memo in ApplicationFill) - this is what slides the
 * row down instead of teleporting it. Dropping it makes confirming an item
 * look broken.
 */
export const COLLAPSIBLE_ROW_TRANSITION = LinearTransition.duration(
  COLLAPSIBLE_DURATION_MS,
)
