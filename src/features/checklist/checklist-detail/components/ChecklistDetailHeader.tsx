import { memo } from 'react'
import { Text, View } from 'react-native'
import { Metric, TagChipList } from '@/components'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import type { HistoryLayout } from '@/lib/preferences'
import { styles } from '../checklist-detail.styles'
import { HistoryLayoutToggle } from './HistoryLayoutToggle'

interface ChecklistDetailHeaderProps {
  checklist: Checklist
  tagLabels: string[]
  applicationsCount: number
  completedCount: number
  historyLayout: HistoryLayout
  onToggleHistoryLayout: () => void
}

export const ChecklistDetailHeader = memo(function ChecklistDetailHeader({
  checklist,
  tagLabels,
  applicationsCount,
  completedCount,
  historyLayout,
  onToggleHistoryLayout,
}: ChecklistDetailHeaderProps) {
  return (
    <View style={styles.listHeader}>
      <View style={styles.titleCol}>
        <Text style={styles.title}>{checklist.title}</Text>
        <TagChipList labels={tagLabels} tone="neutral" />
      </View>
      <View style={styles.metricsRow}>
        <Metric label="Aplicações" value={String(applicationsCount)} />
        <Metric label="Concluídas" value={String(completedCount)} />
        <Metric label="Itens/visita" value={String(checklist.items.length)} />
      </View>
      <View style={styles.historyRow}>
        <Text style={styles.sectionTitle}>Histórico</Text>
        <HistoryLayoutToggle
          layout={historyLayout}
          onToggle={onToggleHistoryLayout}
        />
      </View>
    </View>
  )
})
