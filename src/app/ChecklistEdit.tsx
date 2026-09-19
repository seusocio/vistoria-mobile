import { ChecklistFormView } from '@/features/checklist/checklist-form'
import type { StackRoutesProps } from '@/routes/types'

export function ChecklistEdit({ navigation, route }: StackRoutesProps<'checklistEdit'>) {
  return <ChecklistFormView checklistId={route.params.checklistId} navigation={navigation} />
}
