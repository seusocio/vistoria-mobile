import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useState } from 'react'
import { Application, Checklist } from '@/infra/domain/entities'
import { getChecklist, listApplicationsByChecklist } from '@/infra/services'

export function useChecklistDetail(checklistId: string) {
  const [checklist, setChecklist] = useState<Checklist | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [checklistData, applicationsData] = await Promise.all([
      getChecklist(checklistId),
      listApplicationsByChecklist(checklistId),
    ])
    setChecklist(checklistData)
    setApplications(applicationsData)
  }, [checklistId])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load().finally(() => setLoading(false))
    }, [load]),
  )

  return { checklist, applications, loading, reload: load }
}
