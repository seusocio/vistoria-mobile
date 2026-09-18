import { createContext, useContext } from 'react'

export interface CollapsibleContextValue {
  expanded: boolean
  toggle: () => void
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
