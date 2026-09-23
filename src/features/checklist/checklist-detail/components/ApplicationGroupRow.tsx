import { memo, useCallback } from 'react'
import { ApplicationRow } from '@/components'
import type { ApplicationGroup } from '@/features/application/shared/application.utils'
import type { ApplicationRowEntry } from '@/components/ApplicationRow'
import type { HistoryLayout } from '@/lib/preferences'

type ApplicationGroupWithEntries = ApplicationGroup & {
  entries: ApplicationRowEntry[]
}

interface ApplicationGroupRowProps {
  group: ApplicationGroupWithEntries
  tagLabels: string[]
  layout: HistoryLayout
  defaultExpanded: boolean
  onOpenEntry: (applicationId: string) => void
  onRepeat: (applications: ApplicationGroup['applications']) => void
  onEditTags: (group: ApplicationGroupWithEntries) => void
}

export const ApplicationGroupRow = memo(function ApplicationGroupRow({
  group,
  tagLabels,
  layout,
  defaultExpanded,
  onOpenEntry,
  onRepeat,
  onEditTags,
}: ApplicationGroupRowProps) {
  const handleRepeat = useCallback(
    () => onRepeat(group.applications),
    [group.applications, onRepeat],
  )
  const handleEditTags = useCallback(
    () => onEditTags(group),
    [group, onEditTags],
  )
  return (
    <ApplicationRow
      layout={layout}
      tagLabels={tagLabels}
      latestStatusLabel={
        group.applications[0].status === 'completed' ? 'Concluída' : 'Rascunho'
      }
      latestStatusTone={
        group.applications[0].status === 'completed' ? 'completed' : 'draft'
      }
      entries={group.entries}
      defaultExpanded={defaultExpanded}
      onOpenEntry={onOpenEntry}
      onRepeat={handleRepeat}
      onEditTags={handleEditTags}
    />
  )
})
