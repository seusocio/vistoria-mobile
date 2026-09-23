import { memo } from 'react'
import type { HistoryLayout } from '@/lib/preferences'
import { DenseCard } from './DenseCard'
import { DetailedCard } from './DetailedCard'
import type { ApplicationRowProps } from './types'

export type { ApplicationRowEntry, ApplicationRowProps } from './types'

export interface ApplicationRowLayoutProps extends ApplicationRowProps {
  /** Which history layout to draw. Comes from the persisted user preference. */
  layout?: HistoryLayout
}

/**
 * Component/ApplicationRow - one tag-group of vistorias in a checklist's
 * history, as a full-bleed card that opens to show the visits inside it.
 *
 * Two layouts, chosen by the user and remembered (see `@/lib/preferences`).
 * They are separate components rather than one component branching on a prop:
 * they agree only on the card shell and the data, and disagree about the
 * header, the rows, and where the group's actions live. Folding that into one
 * body would be a component that is two components wearing a trench coat.
 *
 * Callers pass `layout` and otherwise don't care which one renders.
 *
 * The memo lives here and only here. Both layouts are reached through this
 * switch, so memoizing them as well would be a second comparison of props the
 * first one already found equal - see ADR 0008 for what these props have to
 * satisfy to compare at all.
 */
export const ApplicationRow = memo(function ApplicationRow({
  layout = 'detailed',
  ...props
}: ApplicationRowLayoutProps) {
  return layout === 'dense' ? (
    <DenseCard {...props} />
  ) : (
    <DetailedCard {...props} />
  )
})
