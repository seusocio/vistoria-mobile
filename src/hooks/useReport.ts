import { useMemo } from 'react'
import { normalizeApplication } from '@/infra/convex'
import { Application } from '@/infra/domain/entities'
import { DateRange, queryApplicationsByTags } from '@/infra/services'
import { useEntityList } from '@/lib/offline-queue'
import { api } from '../../convex/_generated/api'

export function useReport(
  selectedTagIds: string[],
  dateRange: DateRange | null = null,
) {
  const applicationsData = useEntityList<Application>(
    api.applications.listAll,
    {},
    (application) => application.id,
  )

  const applications = useMemo(
    () =>
      (applicationsData ?? [])
        .filter((application) => !application.deletedAt)
        .map(normalizeApplication),
    [applicationsData],
  )
  const loading = applicationsData === undefined

  const result = useMemo(() => {
    if (selectedTagIds.length === 0) return null
    return queryApplicationsByTags(applications, selectedTagIds, dateRange)
  }, [applications, selectedTagIds, dateRange])

  return { result, loading }
}
