import { useCallback, useMemo, useState } from 'react'
import { useTagsCatalog } from '@/features/tag/shared/use-tags-catalog'
import {
  applicationsListAllQueryKey,
  useApplicationsListRestResult,
} from '@/features/application/shared/application.rest'
import type { Application } from '@/features/application/shared/application.types'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import {
  checklistsListQueryKey,
  useChecklistsListRestResult,
} from '@/features/checklist/shared/checklist.rest'
import { isItemAnswerComplete } from '@/features/application/shared/application.utils'
import { useRefreshOnEndReached } from '@/lib/api/use-refresh-on-end-reached'
import { normalizeApplication } from '@/lib/convex'
import { useEntityList } from '@/lib/offline-queue'
import { useSessionStore } from '@/lib/session/session.store'
import type { TabRoutesProps } from '@/routes/types'
import { api } from '../../../../convex/_generated/api'

export interface ChecklistStats {
  applications: number
  done: number
  total: number
}

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
  const checklistsRest = useChecklistsListRestResult()
  const checklistsData = useEntityList<Checklist>(
    api.checklists.list,
    {},
    { kind: 'checklist', getId: getChecklistId },
    checklistsRest,
  )
  const applicationsRest = useApplicationsListRestResult()
  const applicationsData = useEntityList<Application>(
    api.applications.listAll,
    {},
    { kind: 'application', getId: getApplicationId },
    applicationsRest,
  )

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

  const activeOrgId = useSessionStore((state) => state.activeOrgId)
  const activeProjectId = useSessionStore((state) => state.activeProjectId)
  /**
   * Real pagination for the checklists, a refresh for the applications — they
   * are two different reads with two different constraints.
   *
   * `useChecklistsListRestResult` pages, so reaching the end fetches the next
   * page of checklists. The applications read cannot: it feeds
   * `applicationStatsByChecklist`, an aggregate over *every* application in the
   * project, and a paged source would make every card's "N vistorias" count
   * whatever happened to be loaded. So that one keeps the invalidate-on-end
   * behavior, which at least re-reads it.
   */
  const refreshApplications = useRefreshOnEndReached(
    activeOrgId && activeProjectId
      ? [applicationsListAllQueryKey(activeOrgId, activeProjectId)]
      : [],
  )
  const fetchNextChecklists = checklistsRest?.fetchNextPage
  const onEndReached = useCallback(() => {
    fetchNextChecklists?.()
    refreshApplications()
  }, [fetchNextChecklists, refreshApplications])

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

  // Progress is items declared "sim" over all items — never the applications'
  // `status`, which only says whether a review was closed.
  const applicationStatsByChecklist = useMemo(() => {
    const checklistsById = new Map(checklists.map((checklist) => [checklist.id, checklist]))
    const stats = new Map<string, ChecklistStats>()
    for (const application of applications) {
      const current = stats.get(application.checklistId) ?? {
        applications: 0,
        done: 0,
        total: 0,
      }
      const checklist = checklistsById.get(application.checklistId)
      current.applications += 1
      current.total += application.items.length
      if (checklist) {
        current.done += application.items.filter((item) =>
          isItemAnswerComplete(item, checklist),
        ).length
      }
      stats.set(application.checklistId, current)
    }
    return stats
  }, [applications, checklists])

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
    itemsDone: Array.from(applicationStatsByChecklist.values()).reduce((sum, s) => sum + s.done, 0),
    itemsTotal: Array.from(applicationStatsByChecklist.values()).reduce((sum, s) => sum + s.total, 0),
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
    onEndReached,
    isLoadingMore: checklistsRest?.isFetchingNextPage ?? false,
  }
}
