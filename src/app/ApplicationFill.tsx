import { ApplicationFillView } from '@/features/application/application-fill'
import { ApplicationVisita } from '@/features/application/application-visita'
import type { StackRoutesProps } from '@/routes/types'

/**
 * `ApplicationVisita` is the screen. The legacy `ApplicationFillView` is kept
 * on purpose and still reachable through a `?variant=A` link while the new
 * one settles; both run on the same container.
 */
export function ApplicationFill({ navigation, route }: StackRoutesProps<'applicationFill'>) {
  const { checklistId, applicationId } = route.params
  const legacy = (route.params as { variant?: string }).variant === 'A'
  const props = { checklistId, applicationId, navigation }
  return legacy ? <ApplicationFillView {...props} /> : <ApplicationVisita {...props} />
}
