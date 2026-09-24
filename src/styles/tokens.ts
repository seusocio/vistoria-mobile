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

/** Animation durations. Above ~300ms motion starts to feel sluggish. */
export const duration = {
  fast: 150,
  base: 220,
  sheet: 300,
} as const

export type SpaceToken = keyof typeof space
export type RadiusToken = keyof typeof radius
