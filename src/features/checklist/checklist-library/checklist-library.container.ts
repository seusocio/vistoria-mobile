import { useCallback, useMemo, useState } from 'react'
import { useTagsCatalog } from '@/features/tag/shared/use-tags-catalog'
import type { Application } from '@/features/application/shared/application.types'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { useChecklistsListRestSource } from '@/features/checklist/shared/checklist.rest'
import { normalizeApplication } from '@/lib/convex'
import { useEntityList } from '@/lib/offline-queue'
import type { TabRoutesProps } from '@/routes/types'
import { api } from '../../../../convex/_generated/api'

const EMPTY_CHECKLISTS: Checklist[] = []
const EMPTY_APPLICATIONS: Application[] = []

const getChecklistId = (checklist: Checklist) => checklist.id
const getApplicationId = (application: Application) => application.id

type Navigation = TabRoutesProps<'home'>['navigation']

export interface UseChecklistLibraryContainerProps {
  navigation: Navigation
}

export function useChecklistLibraryContainer({
  navigation,
}: UseChecklistLibraryContainerProps) {
  const checklistsRest = useChecklistsListRestSource()
  const checklistsData = useEntityList<Checklist>(
    api.checklists.list,
    {},
    { kind: 'checklist', getId: getChecklistId },
    checklistsRest,
  )
  const applicationsData = useEntityList<Application>(api.applications.listAll, {}, {
    kind: 'application',
    getId: getApplicationId,
  })

  // `api.checklists.list` already filters deleted rows server-side, but a
  // soft-delete that is still in the outbox has only been applied by the
  // overlay — the row is still in the server's answer.
  const checklists = useMemo(
    () => (checklistsData ?? EMPTY_CHECKLISTS).filter((checklist) => !checklist.deletedAt),
    [checklistsData],
  )

  // Deleting a checklist cascades into its applications on the server. That
  // cascade is one op of kind `checklist`, so the overlay can't mark the
  // applications deleted — keying them off the visible checklists does the
  // same job locally, and stays correct once the server catches up.
  const applications = useMemo(() => {
    const visibleChecklistIds = new Set(checklists.map(getChecklistId))
    return (applicationsData ?? EMPTY_APPLICATIONS)
      .filter(
        (application) =>
          !application.deletedAt && visibleChecklistIds.has(application.checklistId),
      )
      .map(normalizeApplication)
  }, [applicationsData, checklists])

  const loading = checklistsData === undefined || applicationsData === undefined

  const { tagsById, resolveLabels } = useTagsCatalog()
  const [search, setSearch] = useState('')
  const [activeTagId, setActiveTagId] = useState<string | null>(null)
  const [filterVisible, setFilterVisible] = useState(false)
  const hasFilters = search.trim().length > 0 || activeTagId !== null

  const clearFilters = useCallback(() => {
    setSearch('')
    setActiveTagId(null)
  }, [])

  const filterTags = useMemo(() => {
    const ids = new Set<string>()
    for (const checklist of checklists) {
      for (const tagId of checklist.tagsIds) ids.add(tagId)
    }
    return Array.from(ids)
      .map((id) => tagsById.get(id))
      .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
  }, [checklists, tagsById])

  const filteredChecklists = useMemo(() => {
    const query = search.trim().toLowerCase()
    return checklists.filter((checklist) => {
      const labels = resolveLabels(checklist.tagsIds)
      if (activeTagId && !checklist.tagsIds.includes(activeTagId)) return false
      if (!query) return true
      return (
        checklist.title.toLowerCase().includes(query) ||
        labels.some((label) => label.toLowerCase().includes(query))
      )
    })
  }, [checklists, search, activeTagId, resolveLabels])

  const applicationStatsByChecklist = useMemo(() => {
    const stats = new Map<string, { applications: number; completed: number }>()
    for (const application of applications) {
      const current = stats.get(application.checklistId) ?? {
        applications: 0,
        completed: 0,
      }
      current.applications += 1
      if (application.status === 'completed') current.completed += 1
      stats.set(application.checklistId, current)
    }
    return stats
  }, [applications])

  const onOpenChecklist = useCallback(
    (checklistId: string) => {
      navigation.navigate('checklistDetail', { checklistId })
    },
    [navigation],
  )
  const onSelectTag = useCallback((tagId: string | null) => {
    setActiveTagId(tagId)
    setFilterVisible(false)
  }, [])
  const onCreateChecklist = useCallback(() => {
    navigation.navigate('checklistNew')
  }, [navigation])

  return {
    loading,
    checklistCount: checklists.length,
    applicationsCount: applications.length,
    completedCount: applications.filter((application) => application.status === 'completed')
      .length,
    filteredChecklists,
    applicationStatsByChecklist,
    filterTags,
    activeTagId,
    filterVisible,
    hasFilters,
    search,
    resolveLabels,
    onSearchChange: setSearch,
    onOpenFilter: () => setFilterVisible(true),
    onCloseFilter: () => setFilterVisible(false),
    onSelectTag,
    onClearFilters: clearFilters,
    onOpenChecklist,
    onCreateChecklist,
  }
}
