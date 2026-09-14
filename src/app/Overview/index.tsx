import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Metric, PendGroupCard, Screen, TagMultiSelect } from '@/components'
import { Icon } from '@/components/Icon'
import { metricValueColors } from '@/components/Metric'
import { useReport } from '@/hooks/useReport'
import { useTagsCatalog } from '@/hooks/useTagsCatalog'
import { DateRange } from '@/infra/services'
import { colors } from '@/styles'
import {
  endOfDayIso,
  formatBrDate,
  formatBrDateShort,
  shiftDateIso,
  startOfDayIso,
  startOfMonthIso,
  todayIso,
} from '@/utils/date'
import { styles } from './styles'

type PeriodPreset = 'all' | 'today' | 'week' | 'month' | 'custom'

const PRESET_LABEL: Record<PeriodPreset, string> = {
  all: 'Tudo',
  today: 'Hoje',
  week: 'Últimos 7 dias',
  month: 'Este mês',
  custom: 'Personalizado',
}

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
      ? Math.round(
          (result.itemProgress.answered / result.itemProgress.total) * 100,
        )
      : 0
  const appPercent =
    result && result.applicationProgress.total > 0
      ? Math.round(
          (result.applicationProgress.completed /
            result.applicationProgress.total) *
            100,
        )
      : 0
  const totalPendingItems =
    result?.pendingGroups.reduce((sum, group) => sum + group.items.length, 0) ??
    0

  return (
    <Screen
      loading={loading}
      variant="top"
      title="Relatório por tags"
      subtitle="Selecione tags para cruzar aplicações e itens"
    >
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Filtrar por tags (interseção AND)</Text>
        <TagMultiSelect
          selectedIds={tagsIds}
          availableTags={tagsCatalog.activeTags}
          allTagsById={tagsCatalog.tagsById}
          onChange={setTagsIds}
          onCreateTag={tagsCatalog.createTag}
          variant="accent"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Período</Text>
        <View style={styles.presetRow}>
          {(Object.keys(PRESET_LABEL) as PeriodPreset[]).map((key) => (
            <Pressable
              key={key}
              style={({ pressed }) => [
                styles.presetChip,
                preset === key && styles.presetChipActive,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => setPreset(key)}
            >
              <Text
                style={[
                  styles.presetChipText,
                  preset === key && styles.presetChipTextActive,
                ]}
              >
                {PRESET_LABEL[key]}
              </Text>
            </Pressable>
          ))}
        </View>

        {preset === 'custom' && (
          <View style={styles.customRangeRow}>
            <View style={styles.dateStepper}>
              <Pressable
                onPress={() => setCustomFrom((prev) => shiftDateIso(prev, -1))}
                accessibilityLabel="Dia anterior (De)"
              >
                <Icon name="chevron-left" size={16} color={colors.ink.base} />
              </Pressable>
              <Text style={styles.dateStepperValue}>
                {formatBrDate(customFrom)}
              </Text>
              <Pressable
                onPress={() => setCustomFrom((prev) => shiftDateIso(prev, 1))}
                accessibilityLabel="Próximo dia (De)"
              >
                <Icon name="chevron-right" size={16} color={colors.ink.base} />
              </Pressable>
            </View>
            <View style={styles.dateStepper}>
              <Pressable
                onPress={() => setCustomTo((prev) => shiftDateIso(prev, -1))}
                accessibilityLabel="Dia anterior (Até)"
              >
                <Icon name="chevron-left" size={16} color={colors.ink.base} />
              </Pressable>
              <Text style={styles.dateStepperValue}>
                {formatBrDate(customTo)}
              </Text>
              <Pressable
                onPress={() => setCustomTo((prev) => shiftDateIso(prev, 1))}
                accessibilityLabel="Próximo dia (Até)"
              >
                <Icon name="chevron-right" size={16} color={colors.ink.base} />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {tagsIds.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Selecione uma ou mais tags para cruzar torre, unidade, responsável
            ou qualquer outra classificação.
          </Text>
        </View>
      ) : (
        result && (
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
                {totalPendingItems} itens em {result.pendingGroups.length}{' '}
                aplicações
              </Text>
            </View>

            {result.pendingGroups.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  Nenhuma pendência para esta combinação de tags.
                </Text>
              </View>
            ) : (
              <View style={styles.pendList}>
                {result.pendingGroups.map((group) => (
                  <PendGroupCard
                    key={group.application.id}
                    tagLabels={tagsCatalog.resolveLabels(
                      group.application.tagsIds,
                    )}
                    dateLabel={formatBrDateShort(group.application.date)}
                    itemTitles={group.items.map((item) => item.itemTitle)}
                  />
                ))}
              </View>
            )}
          </>
        )
      )}
    </Screen>
  )
}
