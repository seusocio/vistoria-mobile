import { useQuery } from 'convex-helpers/react/cache'
import { normalizeApplication } from '@/infra/convex'
import { Application, Checklist } from '@/infra/domain/entities'
import { useEntityList } from '@/lib/offline-queue'
import { api } from '../../convex/_generated/api'

const EMPTY_CHECKLISTS: Checklist[] = []
const EMPTY_APPLICATIONS: Application[] = []

export function useChecklistLibrary() {
  const checklistsData = useEntityList<Checklist>(api.checklists.list, {}, (c) => c.id)
  const applicationsData = useQuery(api.applications.listAll) as
    | Application[]
    | undefined

  const checklists = checklistsData ?? EMPTY_CHECKLISTS
  const applications = (applicationsData ?? EMPTY_APPLICATIONS).map(
    normalizeApplication,
  )
  const loading = checklistsData === undefined || applicationsData === undefined

  return {
    checklists,
    applications,
    loading,
    applicationsCount: applications.length,
    completedCount: applications.filter((app) => app.status === 'completed')
      .length,
  }
}
