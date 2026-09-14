import { useQuery } from 'convex/react'
import { useMemo } from 'react'
import { normalizeApplication } from '@/infra/convex'
import { Application } from '@/infra/domain/entities'
import { DateRange, queryApplicationsByTags } from '@/infra/services'
import { api } from '../../convex/_generated/api'

export function useReport(
  selectedTagIds: string[],
  dateRange: DateRange | null = null,
) {
  const applicationsData = useQuery(api.applications.listAll) as
    | Application[]
    | undefined

  const applications = useMemo(
    () => (applicationsData ?? []).map(normalizeApplication),
    [applicationsData],
  )
  const loading = applicationsData === undefined

  const result = useMemo(() => {
    if (selectedTagIds.length === 0) return null
    return queryApplicationsByTags(applications, selectedTagIds, dateRange)
  }, [applications, selectedTagIds, dateRange])

  return { result, loading }
}
