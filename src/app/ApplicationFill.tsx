import { ApplicationFillView } from '@/features/application/application-fill'
import type { StackRoutesProps } from '@/routes/types'

export function ApplicationFill({ navigation, route }: StackRoutesProps<'applicationFill'>) {
  const { checklistId, applicationId } = route.params
  return (
    <ApplicationFillView
      checklistId={checklistId}
      applicationId={applicationId}
      navigation={navigation}
    />
  )
}
