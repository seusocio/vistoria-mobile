import { z } from 'zod'

export const applicationMetaSchema = z.object({
  tagsIds: z
    .array(z.string())
    .min(1, 'Selecione ao menos uma tag para a aplicação'),
  date: z.string().min(1, 'Data da visita é obrigatória'),
})
export type ApplicationMetaFormValues = z.infer<typeof applicationMetaSchema>

export const applicationItemDraftSchema = z.object({
  note: z.string(),
  tagsIds: z.array(z.string()),
  quantity: z.number().nullable(),
})
export type ApplicationItemDraftFormValues = z.infer<
  typeof applicationItemDraftSchema
>

export const newApplicationItemSchema = z.object({
  title: z.string().trim().min(1, 'Informe um título para o item'),
  tagsIds: z.array(z.string()),
})
export type NewApplicationItemFormValues = z.infer<
  typeof newApplicationItemSchema
>

export const batchTagEditSchema = z.object({
  tagsIds: z.array(z.string()).min(1, 'Selecione ao menos uma tag'),
})
export type BatchTagEditFormValues = z.infer<typeof batchTagEditSchema>
