import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useCallback, useMemo } from 'react'
import {
  applicationMetaSchema,
  type ApplicationMetaFormValues,
} from '@/features/application/shared/application.schema'
import { create as createApplication } from '@/features/application/shared/application.ops'
import type { Application } from '@/features/application/shared/application.types'
import {
  buildApplication,
  buildRepeatedApplication,
  findLatestApplicationByTagSet,
} from '@/features/application/shared/application.utils'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { useTagsCatalog } from '@/features/tag/shared/use-tags-catalog'
import { normalizeApplication } from '@/lib/convex'
import { useDraft } from '@/lib/forms'
import { enqueueOp, useEntity, useEntityList } from '@/lib/offline-queue'
import type { StackRoutesList } from '@/routes/types'
import { todayIso } from '@/utils/date'
import { api } from '../../../../convex/_generated/api'

type Navigation = NativeStackNavigationProp<StackRoutesList, keyof StackRoutesList>

const getApplicationId = (application: Application) => application.id

export interface UseApplicationNewContainerProps {
  checklistId: string
  navigation: Navigation
}

export function useApplicationNewContainer({
  checklistId,
  navigation,
}: UseApplicationNewContainerProps) {
  // Through the overlay, not a bare useQuery: a checklist created offline
  // exists only as a pending op until it reaches the server, and starting a
  // vistoria on it has to work in the meantime.
  const checklistData = useEntity<Checklist>(
    api.checklists.findById,
    { id: checklistId },
    checklistId,
    'checklist',
  )
  const checklist = checklistData ?? null
  const loading = checklistData === undefined
  const tagsCatalog = useTagsCatalog()

  // The same list the histórico groups: picking a tag set that already exists
  // there has to prefill from its latest vistoria, exactly like the group's
  // "repetir" button does. Filtered by checklistId for the overlay's sake, so
  // an application created offline under another checklist can't leak in.
  const belongsToChecklist = useCallback(
    (application: Application) => application.checklistId === checklistId,
    [checklistId],
  )
  const applicationsData = useEntityList<Application>(
    api.applications.listByChecklistId,
    { checklistId },
    { kind: 'application', getId: getApplicationId, belongs: belongsToChecklist },
  )
  const applications = useMemo(
    () =>
      (applicationsData ?? [])
        .filter((application) => !application.deletedAt)
        .map(normalizeApplication),
    [applicationsData],
  )

  // The entity doesn't exist yet, so `autoCommit: false`: the draft is only
  // persisted locally until the primary action ("Iniciar preenchimento")
  // turns it into a real application. Before this, backing out of the screen
  // — or an iOS kill — threw away whatever tags had been picked.
  const { form, commit, clearDraft } = useDraft<ApplicationMetaFormValues>({
    key: `application-new:${checklistId}`,
    schema: applicationMetaSchema,
    defaultValues: { tagsIds: [], date: todayIso() },
    autoCommit: false,
  })
  const tagsIds = form.watch('tagsIds')

  const previousApplication = useMemo(
    () => findLatestApplicationByTagSet(applications, tagsIds),
    [applications, tagsIds],
  )

  async function onStart() {
    if (!checklist) return
    if (!(await commit())) return
    const values = form.getValues()
    const source = findLatestApplicationByTagSet(applications, values.tagsIds)
    // Prefilled from the previous visit of this same tag set when there is
    // one - the answers come in as suggestions, which is what "repetir" on
    // the histórico card produces too.
    const application = source
      ? buildRepeatedApplication(source, checklist, {
          tagsIds: values.tagsIds,
          date: values.date,
        })
      : buildApplication(
          { checklistId, tagsIds: values.tagsIds, date: values.date },
          checklist,
        )
    // Queued, not awaited: the create is durable the moment it is enqueued,
    // so there is no failure to report back and no reason to make the user
    // wait on the network before the fill screen opens.
    enqueueOp(createApplication, { entity: application })
    void clearDraft()
    navigation.replace('applicationFill', {
      checklistId,
      applicationId: application.id,
    })
  }

  return {
    loading: loading || !checklist,
    checklist,
    control: form.control,
    tagsIds,
    tagsCatalog,
    previousApplicationDate: previousApplication?.date ?? null,
    isSubmitting: form.formState.isSubmitting,
    onBack: () => navigation.goBack(),
    onStart,
  }
}
