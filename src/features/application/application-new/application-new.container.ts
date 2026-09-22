import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  applicationMetaSchema,
  type ApplicationMetaFormValues,
} from '@/features/application/shared/application.schema'
import { create as createApplication } from '@/features/application/shared/application.ops'
import { buildApplication } from '@/features/application/shared/application.utils'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { useTagsCatalog } from '@/features/tag/shared/use-tags-catalog'
import { useDraft } from '@/lib/forms'
import { enqueueOp, useEntity } from '@/lib/offline-queue'
import type { StackRoutesList } from '@/routes/types'
import { todayIso } from '@/utils/date'
import { api } from '../../../../convex/_generated/api'

type Navigation = NativeStackNavigationProp<StackRoutesList, keyof StackRoutesList>

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

  async function onStart() {
    if (!checklist) return
    if (!(await commit())) return
    const values = form.getValues()
    const application = buildApplication(
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
    isSubmitting: form.formState.isSubmitting,
    onBack: () => navigation.goBack(),
    onStart,
  }
}
