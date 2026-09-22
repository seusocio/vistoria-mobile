import { memo, useCallback } from 'react'
import { Checklist } from '@/features/checklist/shared/checklist.types'
import { ChecklistCard } from '@/components/ChecklistCard'

interface ChecklistListItemProps {
  checklist: Checklist
  stats: { applications: number; completed: number }
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
      completedCount={stats.completed}
      onPress={handlePress}
    />
  )
})
