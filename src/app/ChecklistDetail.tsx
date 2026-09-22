import { ChecklistDetailView } from '@/features/checklist/checklist-detail'
import type { StackRoutesProps } from '@/routes/types'

export function ChecklistDetail({ navigation, route }: StackRoutesProps<'checklistDetail'>) {
  return (
    <ChecklistDetailView checklistId={route.params.checklistId} navigation={navigation} />
  )
}
