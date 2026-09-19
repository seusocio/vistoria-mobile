import { useMemo } from 'react'
import { normalizeApplication } from '@/infra/convex'
import { Application, Checklist } from '@/infra/domain/entities'
import { useEntity, useEntityList } from '@/lib/offline-queue'
import { api } from '../../convex/_generated/api'

export function useChecklistDetail(checklistId: string) {
  const checklistData = useEntity<Checklist>(
    api.checklists.findById,
    { id: checklistId },
    checklistId,
  )
  const applicationsData = useEntityList<Application>(
    api.applications.listByChecklistId,
    { checklistId },
    (application) => application.id,
  )

  const checklist = checklistData ?? null
  const applications = useMemo(
    () =>
      (applicationsData ?? [])
        .filter((application) => !application.deletedAt)
        .map(normalizeApplication),
    [applicationsData],
  )
  const loading = checklistData === undefined || applicationsData === undefined

  return { checklist, applications, loading }
}
