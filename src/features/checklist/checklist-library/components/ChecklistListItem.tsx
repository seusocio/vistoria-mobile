import { memo, useCallback } from 'react'
import { Checklist } from '@/features/checklist/shared/checklist.types'
import type { ChecklistStats } from '../checklist-library.container'
import { ChecklistCard } from '@/components/ChecklistCard'

interface ChecklistListItemProps {
  checklist: Checklist
  stats: ChecklistStats
  tagLabels: string[]
  onPress: (checklistId: string) => void
}

export const ChecklistListItem = memo(function ChecklistListItem({
  checklist,
  stats,
  tagLabels,
  onPress,
}: ChecklistListItemProps) {
  const handlePress = useCallback(
    () => onPress(checklist.id),
    [checklist.id, onPress],
  )
  return (
    <ChecklistCard
      title={checklist.title}
      itemsCount={checklist.items.length}
      tagLabels={tagLabels}
      applicationsCount={stats.applications}
      itemsDone={stats.done}
      itemsTotal={stats.total}
      onPress={handlePress}
    />
  )
})
