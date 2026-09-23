import { ReactNode, useMemo } from 'react'
import { CollapsibleContext, type CollapsibleVariant } from './context'

export interface CollapsibleRootProps {
  expanded: boolean
  onToggle: () => void
  /** Which bar design the section wears - see CollapsibleVariant. */
  variant?: CollapsibleVariant
  children: ReactNode
}

/**
 * Controlled accordion section. Renders no host view of its own on purpose:
 * header and content are siblings in whatever column the screen already has,
 * so a section costs exactly the views it draws.
 */
export function CollapsibleRoot({
  expanded,
  onToggle,
  variant = 'section',
  children,
}: CollapsibleRootProps) {
  const value = useMemo(
    () => ({ expanded, toggle: onToggle, variant }),
    [expanded, onToggle, variant],
  )

  return (
    <CollapsibleContext.Provider value={value}>
      {children}
    </CollapsibleContext.Provider>
  )
}
