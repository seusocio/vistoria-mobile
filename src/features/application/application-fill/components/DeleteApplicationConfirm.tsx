import { ConfirmBottomSheet } from '@/components'
import type { ApplicationFillContainer } from '../application-fill.container'

export function DeleteApplicationConfirm({ c }: { c: ApplicationFillContainer }) {
  return (
    <ConfirmBottomSheet
      snapPoints={['30%']}
      visible={c.deleteConfirmationVisible}
      title={`Excluir esta aplicação de "${c.checklist.title}"?`}
      message={`${c.progress.answered} de ${c.progress.total} itens respondidos e todas as fotos anexadas serão excluídos.`}
      confirmLabel="Excluir aplicação"
      onCancel={c.onCancelDelete}
      onConfirm={c.onConfirmDelete}
    />
  )
}
