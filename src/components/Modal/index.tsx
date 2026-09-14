import { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  ModalProps,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { styles } from './styles'

export interface ModalComponentProps extends Omit<ModalProps, 'children'> {
  visible: boolean
  onClose: () => void
  title?: string
  showCloseButton?: boolean
  children: ReactNode
  footer?: ReactNode
}

export function ModalComponent({
  visible,
  onClose,
  title,
  showCloseButton = true,
  children,
  footer,
  ...props
}: ModalComponentProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      {...props}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.overlayTouchable} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
          {(title || showCloseButton) && (
            <View style={styles.header}>
              {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
              {showCloseButton && (
                <Pressable
                  style={({ pressed }) => pressed && { opacity: 0.5 }}
                  onPress={onClose}
                >
                  <Icon name="multiply" size={24} color={colors.gray[600]} />
                </Pressable>
              )}
            </View>
          )}
          <View style={styles.content}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}
