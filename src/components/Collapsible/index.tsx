import { CollapsibleContent } from './Content'
import { CollapsibleHeader, CollapsibleHeaderCount } from './Header'
import { CollapsibleRoot } from './Root'
import { CollapsibleRow, CollapsibleRowTitle } from './Row'

export { COLLAPSIBLE_DURATION_MS, COLLAPSIBLE_ROW_TRANSITION } from './constants'
export type { CollapsibleRootProps } from './Root'
export type { CollapsibleVariant } from './context'
export type { CollapsibleHeaderProps } from './Header'
export type { CollapsibleRowProps } from './Row'

/**
 * Compound accordion section: header bar, animated content, and the row shell
 * the content is filled with. They're always used together, so they share one
 * design (see ./styles.ts) - a screen composes the pieces and contributes only
 * its own accessories, rather than re-describing the same bar and the same row
 * once per screen and letting them drift apart.
 *
 * A screen that needs a different bar picks a `variant` on Root rather than
 * restyling the pieces - see CollapsibleVariant.
 *
 * <Collapsible.Root expanded={expanded} onToggle={toggle}>
 *   <Collapsible.Header title={title}>
 *     <Collapsible.HeaderCount>{items.length}</Collapsible.HeaderCount>
 *   </Collapsible.Header>
 *   <Collapsible.Content>{list}</Collapsible.Content>
 * </Collapsible.Root>
 */
export const Collapsible = {
  Root: CollapsibleRoot,
  Header: CollapsibleHeader,
  HeaderCount: CollapsibleHeaderCount,
  Content: CollapsibleContent,
  Row: CollapsibleRow,
  RowTitle: CollapsibleRowTitle,
}
