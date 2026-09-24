/**
 * Layout tokens — the minimal substitute for a design system.
 *
 * Import from here instead of writing raw numbers inline: inline is how
 * inconsistency creeps in. If a value you need is missing, ADD it here rather
 * than hardcoding it at the call site.
 *
 * Source: mobile-ux skill ("Constantes").
 */

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  sheet: 24,
} as const

/**
 * Minimum touch target: 44pt (iOS HIG) / 48dp (Material). We use 48. Any
 * tappable element needs 48x48 of real hit area — use `hitSlop` when the
 * visual is smaller instead of inflating the drawing.
 */
export const touch = { min: 48 } as const

/**
 * Width of a divider rule.
 *
 * Deliberately 1, and **not** `StyleSheet.hairlineWidth`.
 *
 * `hairlineWidth` is `1 / PixelRatio.get()` — 0.333 on a @3x screen, i.e.
 * exactly one physical pixel. That only survives if the view's edge lands on a
 * physical pixel boundary. Card and row heights here are driven by text and by
 * Collapsible's animated height, so they are fractional, and consecutive rows
 * land at y-offsets cycling through .0 / .333 / .667 of a pixel. At one of
 * those three phases the rule rounds away and the border is simply missing —
 * which is why it looked like every third divider had been deleted.
 *
 * A 1dp rule is three physical pixels at @3x, so no rounding phase can erase
 * it. It also matches what the rest of the app already draws (Screen's nav row
 * and top header, Card, Modal, TagMultiSelect) — the sub-pixel/1pt split was
 * the drift ADR 0001 flagged and never resolved.
 */
export const rule = 1

/** Animation durations. Above ~300ms motion starts to feel sluggish. */
export const duration = {
  fast: 150,
  base: 220,
  sheet: 300,
} as const

export type SpaceToken = keyof typeof space
export type RadiusToken = keyof typeof radius
