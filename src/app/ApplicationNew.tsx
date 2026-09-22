import { ApplicationNewView } from '@/features/application/application-new'
import type { StackRoutesProps } from '@/routes/types'

export function ApplicationNew({ navigation, route }: StackRoutesProps<'applicationNew'>) {
  return <ApplicationNewView checklistId={route.params.checklistId} navigation={navigation} />
}
