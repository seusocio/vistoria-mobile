import { useState } from 'react'
import { buildAdHocItem } from '@/features/application/shared/application.builders'
import { newApplicationItemSchema, type NewApplicationItemFormValues } from '@/features/application/shared/application.schema'
import type { Application, ApplicationItem } from '@/features/application/shared/application.types'
import { useDraft } from '@/lib/forms'

export interface UseNewItemSheetProps {
  application: Application
  /** Buffers the item with the other local edits — it is sent on the next flush. */
  addPendingItem: (item: ApplicationItem) => void
}

/** The "adicionar item" sheet: an ad-hoc item outside the checklist template. */
export function useNewItemSheet({ application, addPendingItem }: UseNewItemSheetProps) {
  const [addingItem, setAddingItem] = useState(false)

  const newItemDraft = useDraft<NewApplicationItemFormValues>({
    key: `application:${application.id}:new-item`,
    schema: newApplicationItemSchema,
    defaultValues: { title: '', tagsIds: [] },
    autoCommit: false,
    onCommit: (values) => {
      addPendingItem(buildAdHocItem(values, application.items.length))
    },
  })

  function handleOpenAddItem() {
    newItemDraft.form.reset({ title: '', tagsIds: [] })
    setAddingItem(true)
  }

  async function handleSaveNewItem() {
    const committed = await newItemDraft.commit()
    if (!committed) return
    setAddingItem(false)
    void newItemDraft.clearDraft()
  }

  return {
    addingItem,
    newItemForm: newItemDraft.form,
    onOpenAddItem: handleOpenAddItem,
    onSaveNewItem: handleSaveNewItem,
    onCloseAddItem: () => setAddingItem(false),
  }
}
