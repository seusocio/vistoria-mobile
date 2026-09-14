import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useState } from 'react'
import { Application, Checklist } from '@/infra/domain/entities'
import { listAllApplications, listChecklists } from '@/infra/services'

export function useChecklistLibrary() {
  const [checklists, setChecklists] = useState<Checklist[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [checklistsList, applicationsList] = await Promise.all([
      listChecklists(),
      listAllApplications(),
    ])
    setChecklists(checklistsList)
    setApplications(applicationsList)
  }, [])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load().finally(() => setLoading(false))
    }, [load]),
  )

  return {
    checklists,
    applications,
    loading,
    applicationsCount: applications.length,
    completedCount: applications.filter((app) => app.status === 'completed')
      .length,
    reload: load,
  }
}
