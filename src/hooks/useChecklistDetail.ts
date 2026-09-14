import { useQuery } from 'convex/react'
import { useMemo } from 'react'
import { normalizeApplication } from '@/infra/convex'
import { Application, Checklist } from '@/infra/domain/entities'
import { api } from '../../convex/_generated/api'

export function useChecklistDetail(checklistId: string) {
  const checklistData = useQuery(api.checklists.findById, {
    id: checklistId,
  }) as Checklist | null | undefined
  const applicationsData = useQuery(api.applications.listByChecklistId, {
    checklistId,
  }) as Application[] | undefined

  const checklist = checklistData ?? null
  const applications = useMemo(
    () => (applicationsData ?? []).map(normalizeApplication),
    [applicationsData],
  )
  const loading = checklistData === undefined || applicationsData === undefined

  return { checklist, applications, loading }
}
