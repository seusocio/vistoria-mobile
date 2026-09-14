import { useQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { normalizeApplication } from '@/infra/convex'
import { Application, Checklist } from '@/infra/domain/entities'
import { api } from '../../convex/_generated/api'

export function useApplicationFill(checklistId: string, applicationId: string) {
  const checklistData = useQuery(api.checklists.findById, {
    id: checklistId,
  }) as Checklist | null | undefined
  const applicationData = useQuery(api.applications.findById, {
    id: applicationId,
  }) as Application | null | undefined

  // Local editing buffer: screen mutates the application and persists it.
  // Seed once from the reactive query so live re-emits never clobber edits.
  const [application, setApplication] = useState<Application | null>(null)
  const seededId = useRef<string | null>(null)

  useEffect(() => {
    if (seededId.current === applicationId || applicationData === undefined) {
      return
    }
    seededId.current = applicationId
    setApplication(
      applicationData ? normalizeApplication(applicationData) : null,
    )
  }, [applicationId, applicationData])

  const checklist = checklistData ?? null
  const loading =
    checklistData === undefined ||
    applicationData === undefined ||
    seededId.current !== applicationId

  return { checklist, application, setApplication, loading }
}
