import { zodResolver } from '@hookform/resolvers/zod'
import { useFieldArray, useForm } from 'react-hook-form'
import {
  Checklist,
  DEFAULT_RESPONSE_OPTIONS,
  ResponseOption,
} from '@/infra/domain/entities'
import {
  ChecklistFormValues,
  ChecklistItemFormValues,
  checklistFormSchema,
} from '@/infra/domain/schemas'

export type ChecklistFormItemState = ChecklistItemFormValues & { key: string }

export interface ApplyTemplateInput {
  title: string
  tagsIds: string[]
  options: ResponseOption[]
  itemTitles: string[]
}

export function checklistToFormValues(checklist?: Checklist): ChecklistFormValues {
  return {
    title: checklist?.title ?? '',
    tagsIds: checklist?.tagsIds ?? [],
    options: checklist?.options ?? DEFAULT_RESPONSE_OPTIONS,
    items: checklist
      ? checklist.items.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          tagsIds: item.tagsIds,
        }))
      : [],
  }
}

export function useChecklistForm(initial?: Checklist) {
  const form = useForm<ChecklistFormValues>({
    resolver: zodResolver(checklistFormSchema),
    defaultValues: checklistToFormValues(initial),
  })
  const optionsArray = useFieldArray({ control: form.control, name: 'options' })
  const itemsArray = useFieldArray({
    control: form.control,
    name: 'items',
    keyName: 'key',
  })

  function applyTemplate(template: ApplyTemplateInput) {
    form.reset({
      title: template.title,
      tagsIds: template.tagsIds,
      options: template.options,
      items: template.itemTitles.map((itemTitle) => ({
        title: itemTitle,
        description: '',
        tagsIds: [],
      })),
    })
  }

  return { form, optionsArray, itemsArray, applyTemplate }
}

export type ChecklistFormApi = ReturnType<typeof useChecklistForm>
