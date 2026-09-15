import { memo } from 'react'
import { PendGroupCard } from '@/components'
import type { ReportPendingGroup } from '@/infra/services'

interface PendingGroupListItemProps {
  group: ReportPendingGroup
  tagLabels: string[]
  dateLabel: string
  itemTitles: string[]
}

export const PendingGroupListItem = memo(function PendingGroupListItem({
  group,
  tagLabels,
  dateLabel,
  itemTitles,
}: PendingGroupListItemProps) {
  return (
    <PendGroupCard
      key={group.application.id}
      tagLabels={tagLabels}
      dateLabel={dateLabel}
      itemTitles={itemTitles}
    />
  )
})
