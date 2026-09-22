# `<feature>.view.tsx`

O **único** componente da feature. Chama o hook do container direto — inclusive o chrome do `Screen`
e o gate de loading.

```tsx
import { Screen } from '@/components'
import {
  useThingEditContainer,
  type UseThingEditContainerProps,
} from './thing-edit.container'
import { styles } from './thing-edit.styles'

export function ThingEditView(props: UseThingEditContainerProps) {
  const c = useThingEditContainer(props)

  return (
    <Screen loading={c.loading} variant="nested" onBack={c.onBack} title={c.thing?.title}>
      {/* ... */}
    </Screen>
  )
}
```

`index.ts` exporta só a view:

```ts
export { ThingEditView } from './thing-edit.view'
```

E a rota, em `src/app/ThingEdit.tsx`, é fina — só o que uma rota realmente tem:

```tsx
import { ThingEditView } from '@/features/thing/thing-edit'
import type { StackRoutesProps } from '@/routes/types'

export function ThingEdit({ navigation, route }: StackRoutesProps<'thingEdit'>) {
  return <ThingEditView thingId={route.params.thingId} navigation={navigation} />
}
```
