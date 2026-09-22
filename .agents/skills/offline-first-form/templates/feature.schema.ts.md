# `<feature>.schema.ts`

zod + os tipos inferidos + os conversores entre entidade e valores de formulário.

```ts
import { z } from 'zod'
import type { Thing } from '@/features/thing/shared/thing.types'

export const thingFormSchema = z.object({
  title: z.string().trim().min(1, 'Informe um título'),
  items: z
    .array(z.object({ id: z.string().optional(), title: z.string() }))
    .min(1, 'Adicione ao menos um item'),
})
export type ThingFormValues = z.infer<typeof thingFormSchema>

/** Aceita `undefined` (ainda carregando) porque o container chama isso antes do dado chegar. */
export function toFormValues(thing: Thing | null | undefined): ThingFormValues {
  return {
    title: thing?.title ?? '',
    items: thing?.items.map((item) => ({ id: item.id, title: item.title })) ?? [],
  }
}
```

As mensagens de erro são o que o usuário lê — escreva em pt-BR, específicas, sem "campo inválido".

No `useFieldArray`, **sempre** `keyName: 'key'`:

```ts
const itemsArray = useFieldArray({ control: form.control, name: 'items', keyName: 'key' })
```

O default do RHF é `id`, e `id` aqui já é o id persistido do item.
