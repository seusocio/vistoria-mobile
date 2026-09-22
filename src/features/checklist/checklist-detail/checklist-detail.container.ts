import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
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
import type { Application } from '@/features/application/shared/application.types'
import {
  buildRepeatedApplication,
  countNegativeAnswers,
  groupApplicationsByTagSet,
} from '@/features/application/shared/application.utils'
import {
  checklistSave,
  checklistSoftDeleteCascade,
} from '@/features/checklist/checklist-form/checklist-form.ops'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { buildDuplicatedChecklist } from '@/features/checklist/shared/checklist.utils'
import { useTagsCatalog } from '@/features/tag/shared/use-tags-catalog'
import { normalizeApplication } from '@/lib/convex'
import { useDraft } from '@/lib/forms'
import { enqueueOp, useEntity, useEntityList } from '@/lib/offline-queue'
import type { StackRoutesList } from '@/routes/types'
import { formatBrDateShort } from '@/utils/date'
import { api } from '../../../../convex/_generated/api'

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
  const checklistData = useEntity<Checklist>(
    api.checklists.findById,
    { id: checklistId },
    checklistId,
    'checklist',
  )
  // `listByChecklistId` is a filtered list, so the overlay needs to be told
  // which locally-created applications belong in it — otherwise a vistoria
  // created offline under another checklist shows up here too.
  const belongsToChecklist = useCallback(
    (application: Application) => application.checklistId === checklistId,
    [checklistId],
  )
  const applicationsData = useEntityList<Application>(
    api.applications.listByChecklistId,
    { checklistId },
    { kind: 'application', getId: getApplicationId, belongs: belongsToChecklist },
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
  const submitted = useRef(false)

  const groups = useMemo(
    () =>
      checklist
        ? groupApplicationsByTagSet(applications).map((group) => ({
            ...group,
            entries: group.applications.map((application): ApplicationRowEntry => ({
              id: application.id,
              dateLabel: formatBrDateShort(application.date),
              negativeCount: countNegativeAnswers(application, checklist),
            })),
          }))
        : [],
    [applications, checklist],
  )

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

  const completedCount = applications.filter(
    (application) => application.status === 'completed',
  ).length

  function handleDuplicate() {
    if (!checklist || submitted.current) return
    submitted.current = true
    const copy = buildDuplicatedChecklist(checklist)
    enqueueOp(checklistSave, { id: copy.id, entity: copy })
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
    navigation.navigate('tabs', { screen: 'home' })
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

  const onRepeat = useCallback(
    (groupApplications: Application[]) => {
      if (!checklist || submitted.current || groupApplications.length === 0) return
      submitted.current = true
      const newApplication = buildRepeatedApplication(groupApplications[0], checklist)
      enqueueOp(createApplication, { entity: newApplication })
      navigation.navigate('applicationFill', {
        checklistId,
        applicationId: newApplication.id,
      })
    },
    [checklist, checklistId, navigation],
  )

  return {
    loading: loading || !checklist,
    checklist,
    checklistId,
    applications,
    applicationsCount: applications.length,
    completedCount,
    groups,
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
  }
}
