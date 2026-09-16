import { ItemCardActions } from './Actions'
import { AnswerToggleRow } from './AnswerToggleRow'
import { ItemCardBadge } from './Badge'
import { ItemCardContent } from './Content'
import { ItemCardDescription } from './Description'
import { ItemCardDragHandle } from './DragHandle'
import { ItemCardMeta, ItemCardMetaItem } from './Meta'
import { ItemCardRoot } from './Root'
import { ItemCardSuggestionPanel } from './SuggestionPanel'
import { ItemCardTitle } from './Title'
import { ItemCardTrailingButton } from './TrailingButton'

export type { ItemCardRootProps } from './Root'

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
  AnswerToggle: AnswerToggleRow,
  TrailingButton: ItemCardTrailingButton,
  SuggestionPanel: ItemCardSuggestionPanel,
}
