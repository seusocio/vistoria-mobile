# `<feature>.container.ts`

Um **hook**. Sem JSX, sem componente, sem interface de props espelhando o retorno à mão.

```ts
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useCallback, useMemo, useState } from 'react'
import { patchTitle } from '@/features/thing/shared/thing.ops'
import type { Thing } from '@/features/thing/shared/thing.types'
import { useDraft } from '@/lib/forms'
import { enqueueOp, useEntity } from '@/lib/offline-queue'
import type { StackRoutesList } from '@/routes/types'
import { api } from '../../../../convex/_generated/api'
import { thingFormSchema, type ThingFormValues } from './thing-edit.schema'

type Navigation = NativeStackNavigationProp<StackRoutesList, keyof StackRoutesList>

export interface UseThingEditContainerProps {
  thingId: string
  navigation: Navigation
}

export function useThingEditContainer({ thingId, navigation }: UseThingEditContainerProps) {
  const thing = useEntity<Thing>(api.things.findById, { id: thingId }, thingId, 'thing')
  const loading = thing === undefined

  // Chamado SEMPRE — hook não pode ser pulado condicionalmente.
  const { form, hydrated, hasPersistedDraft } = useDraft<ThingFormValues>({
    key: `thing:${thingId}`,
    schema: thingFormSchema,
    defaultValues: toFormValues(thing),
    onCommit: (values) => enqueueOp(patchTitle, {
      thingId,
      title: values.title,
      updatedAt: new Date().toISOString(),
    }),
  })

  // Só reseta para o dado do servidor se a hidratação NÃO aplicou um rascunho
  // real — senão descarta a edição não salva do usuário.
  useEffect(() => {
    if (!thing || !hydrated || hasPersistedDraft) return
    form.reset(toFormValues(thing))
  }, [thing, hydrated, hasPersistedDraft, form.reset])

  // Callback por chave, identidade estável — ADR 0008.
  const onSelect = useCallback((childId: string) => { /* ... */ }, [])

  return {
    loading,
    thing,
    form,
    onSelect,
    onBack: () => navigation.goBack(),
  }
}
```
