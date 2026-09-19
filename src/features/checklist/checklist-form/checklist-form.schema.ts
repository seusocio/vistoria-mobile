import { z } from 'zod'
import type { Checklist } from '@/infra/domain/entities'
import { DEFAULT_RESPONSE_OPTIONS } from '@/infra/domain/entities'

export const responseOptionFormSchema = z.object({
  label: z.string().trim().min(1, 'Informe um rótulo'),
  semantic: z.string().min(1),
})
export type ResponseOptionFormValues = z.infer<typeof responseOptionFormSchema>

export const checklistItemFormSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, 'Informe um título para o item'),
  description: z.string(),
  tagsIds: z.array(z.string()),
})
export type ChecklistItemFormValues = z.infer<typeof checklistItemFormSchema>

export const checklistFormSchema = z.object({
  title: z.string().trim().min(1, 'Nome do checklist é obrigatório'),
  tagsIds: z.array(z.string()),
  options: z.array(responseOptionFormSchema),
  items: z.array(checklistItemFormSchema).min(1, 'O checklist deve ter ao menos um item'),
})
export type ChecklistFormValues = z.infer<typeof checklistFormSchema>

/** A field-array row: the item's form values plus RHF's own array key. */
export type ChecklistFormItemState = ChecklistItemFormValues & { key: string }

export function checklistToFormValues(checklist?: Checklist | null): ChecklistFormValues {
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
