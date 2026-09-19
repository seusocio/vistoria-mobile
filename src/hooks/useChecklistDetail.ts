import { useQuery } from 'convex-helpers/react/cache'
import { useMemo } from 'react'
import { normalizeApplication } from '@/infra/convex'
import { Application, Checklist } from '@/infra/domain/entities'
import { useEntity } from '@/lib/offline-queue'
import { api } from '../../convex/_generated/api'

export function useChecklistDetail(checklistId: string) {
  const checklistData = useEntity<Checklist>(
    api.checklists.findById,
    { id: checklistId },
    checklistId,
  )
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
