import { memo } from 'react'
import { Text, View } from 'react-native'
import {
  DatePickerField,
  Metric,
  TagMultiSelect,
} from '@/components'
import type { Tag } from '@/features/tag/shared/tag.types'
import type { ReportResult } from '@/features/report/shared/report.utils'
import { metricValueColors } from '@/components/Metric'
import { styles } from '../report-overview.styles'
import { PeriodPreset, PeriodPresetRow } from './PeriodPresetRow'

interface OverviewHeaderProps {
  tagsIds: string[]
  activeTags: Tag[]
  allTagsById: Map<string, Tag>
  onChangeTags: (ids: string[]) => void
  preset: PeriodPreset
  onPresetChange: (preset: PeriodPreset) => void
  onCreateTag: (label: string) => Promise<Tag>
  customFrom: string
  customTo: string
  onCustomFromChange: (value: string) => void
  onCustomToChange: (value: string) => void
  result: ReportResult | null
  itemPercent: number
  appPercent: number
  totalPendingItems: number
}

export const OverviewHeader = memo(function OverviewHeader({
  tagsIds,
  activeTags,
  allTagsById,
  onChangeTags,
  onCreateTag,
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  result,
  itemPercent,
  appPercent,
  totalPendingItems,
}: OverviewHeaderProps) {
  return (
    <View style={styles.listHeader}>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Filtrar por tags (interseção AND)</Text>
        <TagMultiSelect
          selectedIds={tagsIds}
          availableTags={activeTags}
          allTagsById={allTagsById}
          onChange={onChangeTags}
          onCreateTag={onCreateTag}
          variant="accent"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Período</Text>
        <PeriodPresetRow value={preset} onChange={onPresetChange} />
        {preset === 'custom' ? (
          <View style={styles.customRangeRow}>
            <View style={styles.dateField}>
              <Text style={styles.dateFieldLabel}>De</Text>
              <DatePickerField
                value={customFrom}
                onChange={onCustomFromChange}
                accessibilityLabel="Selecionar data inicial do relatório"
              />
            </View>
            <View style={styles.dateField}>
              <Text style={styles.dateFieldLabel}>Até</Text>
              <DatePickerField
                value={customTo}
                onChange={onCustomToChange}
                accessibilityLabel="Selecionar data final do relatório"
              />
            </View>
          </View>
        ) : null}
      </View>
      {result ? (
        <>
          <View style={styles.statsRow}>
            <Metric
              label="Progresso por item"
              value={`${itemPercent}%`}
              valueColor={metricValueColors.blue}
              detail={`${result.itemProgress.answered}/${result.itemProgress.total} itens respondidos`}
            />
            <Metric
              label="Progresso por aplicação"
              value={`${appPercent}%`}
              valueColor={metricValueColors.green}
              detail={`${result.applicationProgress.completed}/${result.applicationProgress.total} aplicações concluídas`}
            />
          </View>
          <View style={styles.pendHeader}>
            <Text style={styles.pendTitle}>Pendências detalhadas</Text>
            <Text style={styles.pendCount}>
              {totalPendingItems} itens em {result.pendingGroups.length} aplicações
            </Text>
          </View>
        </>
      ) : null}
    </View>
  )
})
