import { useCallback, useMemo, useState } from 'react'
import type { Application } from '@/features/application/shared/application.types'
import {
  queryApplicationsByTags,
  type DateRange,
  type ReportPendingGroup,
} from '@/features/report/shared/report.utils'
import { useTagsCatalog } from '@/features/tag/shared/use-tags-catalog'
import { normalizeApplication } from '@/lib/convex'
import { useEntityList } from '@/lib/offline-queue'
import {
  endOfDayIso,
  formatBrDateShort,
  shiftDateIso,
  startOfDayIso,
  startOfMonthIso,
  todayIso,
} from '@/utils/date'
import { api } from '../../../../convex/_generated/api'
import type { PeriodPreset } from './components/PeriodPresetRow'

export interface PendingListData {
  group: ReportPendingGroup
  tagLabels: string[]
  dateLabel: string
  itemTitles: string[]
}

const getApplicationId = (application: Application) => application.id

export function useReportOverviewContainer() {
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

  const applicationsData = useEntityList<Application>(api.applications.listAll, {}, {
    kind: 'application',
    getId: getApplicationId,
  })
  const applications = useMemo(
    () =>
      (applicationsData ?? [])
        .filter((application) => !application.deletedAt)
        .map(normalizeApplication),
    [applicationsData],
  )
  const loading = applicationsData === undefined

  const result = useMemo(() => {
    if (tagsIds.length === 0) return null
    return queryApplicationsByTags(applications, tagsIds, dateRange)
  }, [applications, tagsIds, dateRange])

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

  const onPresetChange = useCallback((value: PeriodPreset) => setPreset(value), [])

  return {
    loading,
    result,
    tagsIds,
    tagsCatalog,
    preset,
    customFrom,
    customTo,
    itemPercent,
    appPercent,
    totalPendingItems,
    pendingListData,
    onChangeTags: setTagsIds,
    onPresetChange,
    onCustomFromChange: setCustomFrom,
    onCustomToChange: setCustomTo,
  }
}
