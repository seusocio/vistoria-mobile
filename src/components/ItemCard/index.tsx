import { ItemCardActions } from './Actions'
import { ItemCardBadge } from './Badge'
import { ItemCardContent } from './Content'
import { ItemCardDescription } from './Description'
import { ItemCardDragHandle } from './DragHandle'
import { ItemCardMeta, ItemCardMetaItem } from './Meta'
import { ItemCardRoot } from './Root'
import { ItemCardStatusDot } from './StatusDot'
import { ItemCardSuggestionPanel } from './SuggestionPanel'
import { ItemCardTitle } from './Title'
import { ItemCardTrailingButton } from './TrailingButton'

export type { ItemCardRootProps } from './Root'
export { ITEM_COMPLETION_VARIANT_COLOR } from './StatusDot'
export type { ItemCompletionVariant } from './StatusDot'

/**
 * Compound component for a reorderable item row: each screen composes its own
 * layout from these pieces (a checklist template item and an application item
 * mount very differently — see ChecklistFormView and ApplicationItemRow) while
 * sharing the drag-to-reorder shell (Root) and the small building blocks.
 */
export const ItemCard = {
  Root: ItemCardRoot,
  DragHandle: ItemCardDragHandle,
  Badge: ItemCardBadge,
  Content: ItemCardContent,
  Title: ItemCardTitle,
  Description: ItemCardDescription,
  Meta: ItemCardMeta,
  MetaItem: ItemCardMetaItem,
  Actions: ItemCardActions,
  StatusDot: ItemCardStatusDot,
  TrailingButton: ItemCardTrailingButton,
  SuggestionPanel: ItemCardSuggestionPanel,
}
