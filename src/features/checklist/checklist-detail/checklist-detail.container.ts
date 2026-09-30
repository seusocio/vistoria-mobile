import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { ApplicationRowEntry } from '@/components/ApplicationRow'
import {
  create as createApplication,
  updateMeta,
} from '@/features/application/shared/application.ops'
import {
  batchTagEditSchema,
  type BatchTagEditFormValues,
} from '@/features/application/shared/application.schema'
import {
  type ApplicationGroupSnapshot,
  ensureApplicationRest,
  useApplicationGroupsRestResult,
} from '@/features/application/shared/application.rest'
import type { Application } from '@/features/application/shared/application.types'
import {
  buildRepeatedApplication,
  countNegativeAnswers,
  groupApplicationsByTagSet,
  type HistorySortMode,
  sortGroupsByTagLabels,
  tagsKey,
} from '@/features/application/shared/application.utils'
import {
  checklistSave,
  checklistSoftDeleteCascade,
} from '@/features/checklist/checklist-form/checklist-form.ops'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { buildDuplicatedChecklist } from '@/features/checklist/shared/checklist.utils'
import { useTagsCatalog } from '@/features/tag/shared/use-tags-catalog'
import { useChecklistRestResult } from '@/features/checklist/shared/checklist.rest'
import { normalizeApplication } from '@/lib/convex'
import { useDraft } from '@/lib/forms'
import { enqueueOp, useEntity, useEntityList, useOutbox } from '@/lib/offline-queue'
import { useHasHydratedPreferences, usePreferences } from '@/lib/preferences'
import type { StackRoutesList } from '@/routes/types'
import { useSessionStore } from '@/lib/session/session.store'
import { formatBrDateShort } from '@/utils/date'
import { api } from '../../../../convex/_generated/api'
import { presentHistorySortPicker } from './history-sort-picker'

type Navigation = NativeStackNavigationProp<StackRoutesList, keyof StackRoutesList>

const getApplicationId = (application: Application) => application.id

export interface UseChecklistDetailContainerProps {
  checklistId: string
  navigation: Navigation
}

export function useChecklistDetailContainer({
  checklistId,
  navigation,
}: UseChecklistDetailContainerProps) {
  const checklistRest = useChecklistRestResult(checklistId)
  const checklistData = useEntity<Checklist>(
    api.checklists.findById,
    { id: checklistId },
    checklistId,
    'checklist',
    checklistRest,
  )
  // `listByChecklistId` is a filtered list, so the overlay needs to be told
  // which locally-created applications belong in it — otherwise a vistoria
  // created offline under another checklist shows up here too.
  const belongsToChecklist = useCallback(
    (application: Application) => application.checklistId === checklistId,
    [checklistId],
  )
  /**
   * The histórico reads groups, not a flat page: the server keys them on the
   * tag set and embeds the last visits of each, so the screen no longer
   * downloads every item and attachment row in the checklist just to label a
   * card (see `APPLICATION_GROUPS_PARAMS`).
   */
  const applicationGroupsRest = useApplicationGroupsRestResult(checklistId)
  const serverGroups = applicationGroupsRest?.data
  /**
   * The embedded applications, flattened, fed to `useEntityList` as this
   * screen's server half. The groups are a read projection — the outbox tracks
   * *applications* — so flattening is what keeps the overlay working on the
   * only thing it can key on: an entity id. It patches a pending tag edit onto
   * its row and injects a vistoria created offline, exactly as before.
   */
  const applicationsRest = applicationGroupsRest && {
    data: applicationGroupsRest.data?.flatMap((group) => group.applications),
    isFetchedAfterMount: applicationGroupsRest.isFetchedAfterMount,
  }
  const applicationsData = useEntityList<Application>(
    api.applications.listByChecklistId,
    { checklistId },
    { kind: 'application', getId: getApplicationId, belongs: belongsToChecklist },
    applicationsRest,
  )
  /**
   * Whether the server's own grouping can be trusted for this render. A
   * pending write can move an application between groups (a batch tag edit), add
   * one the server has never seen, or remove one — none of which the server's
   * pre-grouped answer knows about until the queue drains and it re-groups. So
   * with anything in the outbox the screen re-groups the overlaid flat list
   * with `groupApplicationsByTagSet`, the same function it used before this
   * endpoint existed: one grouping implementation, not a second one that has to
   * agree with the server's key.
   */
  const hasPendingApplicationWrites = useOutbox((state) =>
    state.items.some((item) => item.kind === 'application'),
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

  const { resolveLabels, activeTags, tagsById, createTag } = useTagsCatalog()
  const queryClient = useQueryClient()
  const activeOrgId = useSessionStore((state) => state.activeOrgId)
  const activeProjectId = useSessionStore((state) => state.activeProjectId)
  const historyLayout = usePreferences((state) => state.historyLayout)
  const toggleHistoryLayout = usePreferences((state) => state.toggleHistoryLayout)
  const preferencesReady = useHasHydratedPreferences()
  const submitted = useRef(false)

  const allGroups = useMemo(() => {
    if (!checklist) return []
    const base: ApplicationGroupSnapshot[] =
      serverGroups && !hasPendingApplicationWrites
        ? serverGroups
        : groupApplicationsByTagSet(applications).map((group) => ({
            tagsIds: group.tagsIds,
            applicationsCount: group.applications.length,
            applications: group.applications,
          }))
    return base.map((group) => ({
      ...group,
      key: tagsKey(group.tagsIds),
      tagLabels: resolveLabels(group.tagsIds),
      entries: group.applications.map((application): ApplicationRowEntry => ({
        id: application.id,
        dateLabel: formatBrDateShort(application.date),
        // The server's count when the payload carried one, counted from items
        // otherwise — an application created offline has its items locally and
        // no counts, and one read from the API has counts and no items.
        negativeCount: application.negativeCount ?? countNegativeAnswers(application, checklist),
        status: application.status,
      })),
    }))
  }, [applications, checklist, hasPendingApplicationWrites, resolveLabels, serverGroups])

  const [historySearch, setHistorySearch] = useState('')
  const [historySortMode, setHistorySortMode] = useState<HistorySortMode>('numeric')
  const historyHasFilter = historySearch.trim().length > 0 || historySortMode !== 'numeric'

  const groups = useMemo(() => {
    const query = historySearch.trim().toLowerCase()
    const filtered = query
      ? allGroups.filter((group) =>
          group.tagLabels.some((label) => label.toLowerCase().includes(query)),
        )
      : allGroups
    return sortGroupsByTagLabels(filtered, historySortMode)
  }, [allGroups, historySearch, historySortMode])

  const [deleteConfirmationVisible, setDeleteConfirmationVisible] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editingGroup, setEditingGroup] = useState<(typeof groups)[number] | null>(null)

  /**
   * Keyed per group, so reopening the sheet — or reopening the app after a
   * kill — restores the tags that were being edited for *that* group and not
   * for whichever one happens to be open next.
   */
  const { form, commit, clearDraft } = useDraft<BatchTagEditFormValues>({
    key: `batch-tags:${editingGroup?.key ?? 'none'}`,
    schema: batchTagEditSchema,
    defaultValues: { tagsIds: [] },
    autoCommit: false,
  })

  /**
   * Summed from the groups, not `applications.length`: the flat list is the
   * *embedded* visits, which the server truncates per group, while
   * `applicationsCount` is the real total. `completedCount` has no such field
   * to read and is counted from what came down — it can undercount a group past
   * `applicationsPerGroup` visits.
   */
  const applicationsCount = allGroups.reduce((total, group) => total + group.applicationsCount, 0)
  const completedCount = applications.filter(
    (application) => application.status === 'completed',
  ).length

  function handleDuplicate() {
    if (!checklist || submitted.current) return
    submitted.current = true
    const copy = buildDuplicatedChecklist(checklist)
    enqueueOp(checklistSave, { id: copy.id, entity: copy, isCreate: true })
    navigation.replace('checklistDetail', { checklistId: copy.id })
    submitted.current = false
  }

  function confirmDelete() {
    if (deleting) return
    setDeleting(true)
    enqueueOp(checklistSoftDeleteCascade, {
      id: checklistId,
      deletedAt: new Date().toISOString(),
    })
    setDeleteConfirmationVisible(false)
    // popTo, not navigate: `tabs` is the stack's root route, and navigate only
    // reuses a route when it is the *focused* one — from here it would push a
    // second tabs screen on top of the checklist we just deleted.
    navigation.popTo('tabs', { screen: 'home' })
  }

  const onEditTags = useCallback(
    (group: (typeof groups)[number]) => {
      form.reset({ tagsIds: group.tagsIds })
      setEditingGroup(group)
    },
    [form.reset],
  )

  /**
   * One queued `updateMeta` per application instead of the single
   * `setTagsForMany` mutation: an op is keyed to exactly one entity, which is
   * what lets the overlay show the new tags on each row immediately. Groups
   * here are a handful of applications, so the extra round trips are cheap —
   * and they all drain in order behind one another anyway.
   */
  async function onSaveBatchTags() {
    if (!editingGroup) return
    if (!(await commit())) return
    const updatedAt = new Date().toISOString()
    for (const application of editingGroup.applications) {
      enqueueOp(updateMeta, {
        applicationId: application.id,
        checklistId,
        tagsIds: form.getValues().tagsIds,
        updatedAt,
      })
    }
    void clearDraft()
    setEditingGroup(null)
  }

  const onOpenHistorySort = useCallback(() => {
    presentHistorySortPicker(setHistorySortMode)
  }, [])

  const onOpenEntry = useCallback(
    (applicationId: string) => {
      navigation.navigate('applicationFill', { checklistId, applicationId })
    },
    [checklistId, navigation],
  )

  /**
   * "Repetir" copies the previous visit's answers, and the histórico's read
   * carries no items (`APPLICATION_GROUPS_PARAMS`) — so the group's latest
   * application is a header, not a source, and the real one has to be resolved
   * before it can be copied. From the cache when it is there, from the server
   * otherwise; a pending application created offline already has its items and
   * skips both.
   */
  const loadRepeatSource = useCallback(
    async (latest: Application): Promise<Application> => {
      if (latest.items.length > 0) return latest
      if (!activeOrgId || !activeProjectId) return latest
      try {
        return await ensureApplicationRest(queryClient, activeOrgId, activeProjectId, latest.id)
      } catch {
        // Offline and never opened on this device. Copying nothing gives a new
        // visit with the same tags and no carried-over answers, which is worse
        // than the old behavior but better than refusing to start a vistoria
        // the user asked for — the answers were never on the device to copy.
        return latest
      }
    },
    [activeOrgId, activeProjectId, queryClient],
  )

  const onRepeat = useCallback(
    async (groupApplications: Application[]) => {
      if (!checklist || submitted.current || groupApplications.length === 0) return
      submitted.current = true
      try {
        const source = await loadRepeatSource(groupApplications[0])
        const newApplication = buildRepeatedApplication(source, checklist)
        enqueueOp(createApplication, { entity: newApplication })
        navigation.navigate('applicationFill', {
          checklistId,
          applicationId: newApplication.id,
        })
      } finally {
        // Released, not left set: the fill screen pops *back* to this still
        // mounted screen, so a guard that stays true would make "repetir" work
        // once per visit to the checklist.
        submitted.current = false
      }
    },
    [checklist, checklistId, loadRepeatSource, navigation],
  )

  return {
    /**
     * Waits on the preference too, not just the data. AsyncStorage hydration
     * is async, so a `dense` user would otherwise get one frame of `detailed`
     * and a visible re-layout. Data loading is normally the slower of the two,
     * so this costs nothing in practice.
     */
    loading: loading || !checklist || !preferencesReady,
    checklist,
    checklistId,
    applications,
    applicationsCount,
    completedCount,
    groups,
    hasApplications: applicationsCount > 0,
    historySearch,
    onHistorySearchChange: setHistorySearch,
    historySortMode,
    onOpenHistorySort,
    historyHasFilter,
    resolveLabels,
    activeTags,
    tagsById,
    createTag,
    control: form.control,
    errorMessage: form.formState.errors.tagsIds?.message,
    isSubmitting: form.formState.isSubmitting,
    editingGroup,
    deleteConfirmationVisible,
    deleting,
    onBack: () => navigation.goBack(),
    onNewApplication: () => navigation.navigate('applicationNew', { checklistId }),
    onEditChecklist: () => navigation.navigate('checklistEdit', { checklistId }),
    onDuplicate: handleDuplicate,
    onAskDelete: () => setDeleteConfirmationVisible(true),
    onCancelDelete: () => setDeleteConfirmationVisible(false),
    onConfirmDelete: confirmDelete,
    onOpenEntry,
    onRepeat,
    onEditTags,
    onCloseBatchEdit: () => setEditingGroup(null),
    onSaveBatchTags,
    historyLayout,
    onToggleHistoryLayout: toggleHistoryLayout,
  }
}
