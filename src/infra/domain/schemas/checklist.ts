import { z } from 'zod'

export const responseOptionFormSchema = z.object({
  label: z.string().trim().min(1, 'Informe um rótulo'),
  semantic: z.enum(['positivo', 'negativo', 'neutro']),
})
export type ResponseOptionFormValues = z.infer<typeof responseOptionFormSchema>

export const checklistItemFormSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, 'Informe um título para o item'),
  description: z.string(),
  tagsIds: z.array(z.string()),
})
export type ChecklistItemFormValues = z.infer<typeof checklistItemFormSchema>

export const checklistTitleSchema = z
  .string()
  .trim()
  .min(1, 'Nome do checklist é obrigatório')

/** Validates only that the array is non-empty; item-level shape is `checklistItemFormSchema`. */
export const minChecklistItemsSchema = z
  .array(z.unknown())
  .min(1, 'O checklist deve ter ao menos um item')

export const checklistFormSchema = z.object({
  title: checklistTitleSchema,
  tagsIds: z.array(z.string()),
  options: z.array(responseOptionFormSchema),
  items: z.array(checklistItemFormSchema).min(1, 'O checklist deve ter ao menos um item'),
})
export type ChecklistFormValues = z.infer<typeof checklistFormSchema>
