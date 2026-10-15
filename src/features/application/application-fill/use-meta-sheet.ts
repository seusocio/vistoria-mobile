import { useState } from 'react'
import { applicationMetaSchema, type ApplicationMetaFormValues } from '@/features/application/shared/application.schema'
import type { Application } from '@/features/application/shared/application.types'
import { useDraft } from '@/lib/forms'
import { enqueueOp } from '@/lib/offline-queue'
import { updateMeta } from '../shared/application.ops'

export interface UseMetaSheetProps {
  application: Application
  checklistId: string
  setApplicationError: (message: string | null) => void
}

/** The "editar" sheet for the visit's own tags and date. Saving queues `updateMeta` right away — unlike item edits, it isn't buffered. */
export function useMetaSheet({ application, checklistId, setApplicationError }: UseMetaSheetProps) {
  const [editingApplication, setEditingApplication] = useState(false)

  const metaDraft = useDraft<ApplicationMetaFormValues>({
    key: `application:${application.id}:meta`,
    schema: applicationMetaSchema,
    defaultValues: { tagsIds: [], date: '' },
    autoCommit: false,
    onCommit: (values) => {
      enqueueOp(updateMeta, {
        applicationId: application.id,
        checklistId,
        tagsIds: values.tagsIds,
        date: values.date,
        updatedAt: new Date().toISOString(),
      })
    },
  })

  function handleOpenEditApplication() {
    metaDraft.form.reset({ tagsIds: application.tagsIds, date: application.date })
    setApplicationError(null)
    setEditingApplication(true)
  }

  async function handleSaveApplication() {
    const committed = await metaDraft.commit()
    if (!committed) return
    setEditingApplication(false)
    void metaDraft.clearDraft()
  }

  return {
    editingApplication,
    metaForm: metaDraft.form,
    onEditApplication: handleOpenEditApplication,
    onSaveApplication: handleSaveApplication,
    onCloseEditApplication: () => setEditingApplication(false),
  }
}
