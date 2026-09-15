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
        <View style={styles.warning}>
          <Text style={styles.warningText}>Esta ação não pode ser desfeita.</Text>
        </View>
      </BottomSheetView>
    </AppBottomSheet>
  )
}
