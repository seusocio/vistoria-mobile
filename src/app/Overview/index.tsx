import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native'
import { memo, useCallback, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { Screen } from '@/components'
import { useReport } from '@/hooks/useReport'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import type { ReportPendingGroup } from '@/infra/services'
import { DateRange } from '@/infra/services'
import {
  endOfDayIso,
  formatBrDateShort,
  shiftDateIso,
  startOfDayIso,
  startOfMonthIso,
  todayIso,
} from '@/utils/date'
import { styles } from './styles'
import { OverviewHeader } from './components/OverviewHeader'
import {
  PeriodPreset,
} from './components/PeriodPresetRow'
import { PendingGroupListItem } from './components/PendingGroupListItem'

type PendingListData = {
  group: ReportPendingGroup
  tagLabels: string[]
  dateLabel: string
  itemTitles: string[]
}

const PendingSeparator = () => <View style={styles.listSeparator} />

const OverviewEmpty = memo(function OverviewEmpty({ hasTags }: { hasTags: boolean }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>
        {hasTags
          ? 'Nenhuma pendência para esta combinação de tags.'
          : 'Selecione uma ou mais tags para cruzar torre, unidade, responsável ou qualquer outra classificação.'}
      </Text>
    </View>
  )
})

export function Overview() {
  const [tagsIds, setTagsIds] = useState<string[]>([])
  const [preset, setPreset] = useState<PeriodPreset>('all')
  const [customFrom, setCustomFrom] = useState(todayIso())
  const [customTo, setCustomTo] = useState(todayIso())
  const tagsCatalog = useTagsCatalog()

  const dateRange = useMemo<DateRange | null>(() => {
    const today = todayIso()
    switch (preset) {
      case 'all':
        return null
      case 'today':
        return { from: startOfDayIso(today), to: endOfDayIso(today) }
      case 'week':
        return {
          from: startOfDayIso(shiftDateIso(today, -6)),
          to: endOfDayIso(today),
        }
      case 'month':
        return { from: startOfMonthIso(today), to: endOfDayIso(today) }
      case 'custom':
        return { from: startOfDayIso(customFrom), to: endOfDayIso(customTo) }
    }
  }, [preset, customFrom, customTo])

  const { result, loading } = useReport(tagsIds, dateRange)
  const itemPercent =
    result && result.itemProgress.total > 0
      ? Math.round((result.itemProgress.answered / result.itemProgress.total) * 100)
      : 0
  const appPercent =
    result && result.applicationProgress.total > 0
      ? Math.round(
          (result.applicationProgress.completed / result.applicationProgress.total) * 100,
        )
      : 0
  const totalPendingItems =
    result?.pendingGroups.reduce((sum, group) => sum + group.items.length, 0) ?? 0

  const pendingListData = useMemo<PendingListData[]>(
    () =>
      result?.pendingGroups.map((group) => ({
        group,
        tagLabels: tagsCatalog.resolveLabels(group.application.tagsIds),
        dateLabel: formatBrDateShort(group.application.date),
        itemTitles: group.items.map((item) => item.itemTitle),
      })) ?? [],
    [result, tagsCatalog.resolveLabels],
  )
  const renderPending = useCallback(
    ({ item }: LegendListRenderItemProps<PendingListData>) => (
      <PendingGroupListItem
        group={item.group}
        tagLabels={item.tagLabels}
        dateLabel={item.dateLabel}
        itemTitles={item.itemTitles}
      />
    ),
    [],
  )
  const handlePresetChange = useCallback((value: PeriodPreset) => {
    setPreset(value)
  }, [])

  return (
    <Screen
      loading={loading}
      variant="top"
      title="Relatório por tags"
      subtitle="Selecione tags para cruzar aplicações e itens"
      content={
        <LegendList
          data={pendingListData}
          renderItem={renderPending}
          keyExtractor={(item) => item.group.application.id}
          ListHeaderComponent={
            <OverviewHeader
              tagsIds={tagsIds}
              activeTags={tagsCatalog.activeTags}
              allTagsById={tagsCatalog.tagsById}
              onChangeTags={setTagsIds}
              onCreateTag={tagsCatalog.createTag}
              preset={preset}
              onPresetChange={handlePresetChange}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
              result={result}
              itemPercent={itemPercent}
              appPercent={appPercent}
              totalPendingItems={totalPendingItems}
            />
          }
          ListEmptyComponent={<OverviewEmpty hasTags={tagsIds.length > 0} />}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={PendingSeparator}
          estimatedItemSize={180}
          recycleItems
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      }
    />
  )
}
