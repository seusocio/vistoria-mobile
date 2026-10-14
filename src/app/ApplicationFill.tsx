import { View } from 'react-native'
import { PrototypeSwitcher } from '@/components/PrototypeSwitcher'
import { ApplicationFillView } from '@/features/application/application-fill'
import { VisitaPrototypeHost } from '@/features/application/application-fill/prototype/VisitaPrototypeHost'
import type { StackRoutesProps } from '@/routes/types'

// PROTOTYPE: two variants of this route, switchable via `?variant=` (A = current, B = Visita redesign).
const VARIANTS = [
  { key: 'A', name: 'Atual' },
  { key: 'B', name: 'Visita — Atividade/Pendências' },
]

export function ApplicationFill({ navigation, route }: StackRoutesProps<'applicationFill'>) {
  const { checklistId, applicationId } = route.params
  const variant = (route.params as { variant?: string }).variant ?? 'A'
  const props = { checklistId, applicationId, navigation }
  return (
    <View style={{ flex: 1 }}>
      {variant === 'B' ? <VisitaPrototypeHost {...props} /> : <ApplicationFillView {...props} />}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(key) => navigation.setParams({ variant: key } as never)}
      />
    </View>
  )
}
