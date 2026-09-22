import { ChecklistLibraryView } from '@/features/checklist/checklist-library'
import type { TabRoutesProps } from '@/routes/types'

export function Library({ navigation }: TabRoutesProps<'home'>) {
  return <ChecklistLibraryView navigation={navigation} />
}
