import { BottomSheetView } from '@gorhom/bottom-sheet'
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { AppBottomSheet } from '../AppBottomSheet'
import { useSheetFooterActions } from '../SheetFooterActions'
import { styles } from './styles'

export interface ConfirmBottomSheetProps {
  visible: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  confirming?: boolean
  /** Shown in a highlighted box below the message. Pass `false` to omit it
   * (e.g. when the action is still undoable afterward). */
  warning?: ReactNode | false
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmBottomSheet({
  visible,
  title,
  message,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  confirming = false,
  warning = 'Esta ação não pode ser desfeita.',
  onCancel,
  onConfirm,
}: ConfirmBottomSheetProps) {
  const footerComponent = useSheetFooterActions({
    confirmLabel: confirming ? `${confirmLabel}...` : confirmLabel,
    onConfirm,
    confirming,
    cancelLabel,
    onCancel,
    tone: 'danger',
  })
  return (
    <AppBottomSheet
      visible={visible}
      onClose={onCancel}
      dismissible={!confirming}
      snapPoints={['26%']}
      footerComponent={footerComponent}
    >
      <BottomSheetView style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        {warning ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>{warning}</Text>
          </View>
        ) : null}
      </BottomSheetView>
    </AppBottomSheet>
  )
}
