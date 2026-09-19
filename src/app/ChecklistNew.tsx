import { ChecklistFormContainer } from '@/features/checklist/checklist-form'
import type { StackRoutesProps } from '@/routes/types'

export function ChecklistNew({ navigation }: StackRoutesProps<'checklistNew'>) {
  return <ChecklistFormContainer navigation={navigation} />
}
