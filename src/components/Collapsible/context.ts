import { createContext, useContext } from 'react'

/**
 * How much chrome the bar draws for itself.
 *
 * - `section` - the full-bleed list section: opaque bar, hairline rule under
 *   it, its own padding. The accordion is the only thing on that stretch of
 *   screen, so it has to draw its own edges.
 * - `card` - the accordion *is* a card in a list. The card around it already
 *   supplies background, border, radius and padding; the bar drawing a second
 *   set would double every edge up.
 */
export type CollapsibleVariant = 'section' | 'card'

export interface CollapsibleContextValue {
  expanded: boolean
  toggle: () => void
  variant: CollapsibleVariant
}

export const CollapsibleContext = createContext<CollapsibleContextValue | null>(
  null,
)

export function useCollapsible(): CollapsibleContextValue {
  const context = useContext(CollapsibleContext)
  if (!context) {
    throw new Error('Collapsible.* must be rendered inside <Collapsible.Root>')
  }
  return context
}
