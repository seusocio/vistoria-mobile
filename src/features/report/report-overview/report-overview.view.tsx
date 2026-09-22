import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native'
import { memo, useCallback } from 'react'
import { Text, View } from 'react-native'
import { Screen } from '@/components'
import {
  useReportOverviewContainer,
  type PendingListData,
} from './report-overview.container'
import { styles } from './report-overview.styles'
import { OverviewHeader } from './components/OverviewHeader'
import { PendingGroupListItem } from './components/PendingGroupListItem'

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

export function ReportOverviewView() {
  const c = useReportOverviewContainer()

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

  return (
    <Screen
      loading={c.loading}
      variant="top"
      title="Relatório por tags"
      subtitle="Selecione tags para cruzar aplicações e itens"
      content={
        <LegendList
          data={c.pendingListData}
          renderItem={renderPending}
          keyExtractor={(item) => item.group.application.id}
          ListHeaderComponent={
            <OverviewHeader
              tagsIds={c.tagsIds}
              activeTags={c.tagsCatalog.activeTags}
              allTagsById={c.tagsCatalog.tagsById}
              onChangeTags={c.onChangeTags}
              onCreateTag={c.tagsCatalog.createTag}
              preset={c.preset}
              onPresetChange={c.onPresetChange}
              customFrom={c.customFrom}
              customTo={c.customTo}
              onCustomFromChange={c.onCustomFromChange}
              onCustomToChange={c.onCustomToChange}
              result={c.result}
              itemPercent={c.itemPercent}
              appPercent={c.appPercent}
              totalPendingItems={c.totalPendingItems}
            />
          }
          ListEmptyComponent={<OverviewEmpty hasTags={c.tagsIds.length > 0} />}
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
