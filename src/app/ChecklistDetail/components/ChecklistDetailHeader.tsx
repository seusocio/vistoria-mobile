import { memo } from 'react'
import { Text, View } from 'react-native'
import { Metric, TagChipList } from '@/components'
import type { Checklist } from '@/infra/domain/entities'
import { styles } from '../styles'

interface ChecklistDetailHeaderProps {
  checklist: Checklist
  tagLabels: string[]
  applicationsCount: number
  completedCount: number
}

export const ChecklistDetailHeader = memo(function ChecklistDetailHeader({
  checklist,
  tagLabels,
  applicationsCount,
  completedCount,
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
      <Text style={styles.sectionTitle}>Histórico</Text>
    </View>
  )
})
