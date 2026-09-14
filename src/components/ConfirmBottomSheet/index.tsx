import { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ModalComponent } from '../Modal'
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
  return (
    <ModalComponent
      visible={visible}
      onClose={onCancel}
      title={title}
      showCloseButton={false}
      footer={
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.pressed,
            ]}
            onPress={onCancel}
            disabled={confirming}
          >
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.confirmButton,
              pressed && styles.pressed,
              confirming && styles.disabled,
            ]}
            onPress={onConfirm}
            disabled={confirming}
            accessibilityRole="button"
          >
            <Text style={styles.confirmText}>
              {confirming ? 'Excluindo...' : confirmLabel}
            </Text>
          </Pressable>
        </View>
      }
    >
      <Text style={styles.message}>{message}</Text>
      <View style={styles.warning}>
        <Text style={styles.warningText}>Esta ação não pode ser desfeita.</Text>
      </View>
    </ModalComponent>
  )
}
