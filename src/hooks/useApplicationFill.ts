import { useQuery } from 'convex-helpers/react/cache'
import { useMemo } from 'react'
import { normalizeApplication } from '@/infra/convex'
import { Application, Checklist } from '@/infra/domain/entities'
import { api } from '../../convex/_generated/api'

export function useApplicationFill(checklistId: string, applicationId: string) {
  const checklistData = useQuery(api.checklists.findById, {
    id: checklistId,
  }) as Checklist | null | undefined
  const rawApplication = useQuery(api.applications.findById, {
    id: applicationId,
  }) as Application | null | undefined
  const application = useMemo(
    () => (rawApplication ? normalizeApplication(rawApplication) : null),
    [rawApplication],
  )

  return {
    checklist: checklistData ?? null,
    application,
    loading: checklistData === undefined || rawApplication === undefined,
  }
}
