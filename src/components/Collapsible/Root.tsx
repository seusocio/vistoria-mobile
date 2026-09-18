import { ReactNode, useMemo } from 'react'
import { CollapsibleContext } from './context'

export interface CollapsibleRootProps {
  expanded: boolean
  onToggle: () => void
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
  children,
}: CollapsibleRootProps) {
  const value = useMemo(
    () => ({ expanded, toggle: onToggle }),
    [expanded, onToggle],
  )

  return (
    <CollapsibleContext.Provider value={value}>
      {children}
    </CollapsibleContext.Provider>
  )
}
