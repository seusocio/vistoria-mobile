import { useCallback, useEffect, useState } from 'react'
import { Application, Checklist } from '@/infra/domain/entities'
import { getApplication, getChecklist } from '@/infra/services'

export function useApplicationFill(checklistId: string, applicationId: string) {
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [application, setApplication] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [checklistData, applicationData] = await Promise.all([
      getChecklist(checklistId),
      getApplication(applicationId),
    ])
    setChecklist(checklistData)
    setApplication(applicationData)
  }, [checklistId, applicationId])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  return { checklist, application, setApplication, loading, reload: load }
}
