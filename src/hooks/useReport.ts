import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
import { Application } from '@/infra/domain/entities'
import {
  DateRange,
  listAllApplications,
  queryApplicationsByTags,
} from '@/infra/services'

export function useReport(
  selectedTagIds: string[],
  dateRange: DateRange | null = null,
) {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const data = await listAllApplications()
    setApplications(data)
  }, [])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load().finally(() => setLoading(false))
    }, [load]),
  )

  const result = useMemo(() => {
    if (selectedTagIds.length === 0) return null
    return queryApplicationsByTags(applications, selectedTagIds, dateRange)
  }, [applications, selectedTagIds, dateRange])

  return { result, loading, reload: load }
}
