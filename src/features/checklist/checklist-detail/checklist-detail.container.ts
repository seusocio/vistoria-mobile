import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import {
  create as createApplication,
  updateMeta,
} from '@/features/application/shared/application.ops'
import {
  batchTagEditSchema,
  type BatchTagEditFormValues,
} from '@/features/application/shared/application.schema'
import { ensureApplicationRest, readApplicationFromCache } from '@/features/application/shared/application.cache'
import type { Application } from '@/features/application/shared/application.types'
import { buildRepeatedApplication } from '@/features/application/shared/application.builders'
import {
  checklistSave,
  checklistSoftDeleteCascade,
} from '@/features/checklist/checklist-form/checklist-form.ops'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { buildDuplicatedChecklist } from '@/features/checklist/shared/checklist.utils'
import { useTagsCatalog } from '@/features/tag/shared/use-tags-catalog'
import { useChecklistRestResult } from '@/features/checklist/shared/checklist.rest'
import { useDraft } from '@/lib/forms'
import { enqueueOp, useEntity, useIsOnline } from '@/lib/offline-queue'
import { useHasHydratedPreferences, usePreferences } from '@/lib/preferences'
import type { StackRoutesList } from '@/routes/types'
import { useSessionStore } from '@/lib/session/session.store'
import { type HistoryGroup, useHistoryGroups } from './use-history-groups'

type Navigation = NativeStackNavigationProp<StackRoutesList, keyof StackRoutesList>


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
    checklistRest,
    checklistId,
    'checklist',
  )

  const checklist = checklistData ?? null
  const { resolveLabels, activeTags, tagsById, createTag } = useTagsCatalog()
  const {
    applicationsData,
    applications,
    groups,
    applicationsCount,
    historySearch,
    setHistorySearch,
    historySortMode,
    historyHasFilter,
    onOpenHistorySort,
    onEndReached,
    isLoadingMore,
  } = useHistoryGroups({ checklistId, checklist, resolveLabels })
  const loading = checklistData === undefined || applicationsData === undefined

  const queryClient = useQueryClient()
  const activeOrgId = useSessionStore((state) => state.activeOrgId)
  const activeProjectId = useSessionStore((state) => state.activeProjectId)
  const historyLayout = usePreferences((state) => state.historyLayout)
  const toggleHistoryLayout = usePreferences((state) => state.toggleHistoryLayout)
  const preferencesReady = useHasHydratedPreferences()
  const isOnline = useIsOnline()
  const submitted = useRef(false)

  const [deleteConfirmationVisible, setDeleteConfirmationVisible] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editingGroup, setEditingGroup] = useState<HistoryGroup | null>(null)

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
    (group: HistoryGroup) => {
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
      // Cache-only while offline. React Query's default `networkMode: 'online'`
      // *pauses* a fetch started with no network instead of rejecting it, so
      // awaiting one here never resolves and never throws: the `catch` below
      // could not fire, `submitted.current` stayed true, and "Nova aplicação"
      // was dead for the rest of this screen's life — on every group, since
      // that guard is one shared ref.
      if (!isOnline) {
        return readApplicationFromCache(queryClient, activeOrgId, activeProjectId, latest.id) ?? latest
      }
      try {
        return await ensureApplicationRest(queryClient, activeOrgId, activeProjectId, latest.id)
      } catch {
        // Online but the read failed. Copying nothing gives a new visit with the
        // same tags and no carried-over answers, which is worse than the old
        // behavior but better than refusing to start a vistoria the user asked
        // for — the answers were never on the device to copy.
        return latest
      }
    },
    [activeOrgId, activeProjectId, isOnline, queryClient],
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
    onEndReached,
    isLoadingMore,
  }
}
