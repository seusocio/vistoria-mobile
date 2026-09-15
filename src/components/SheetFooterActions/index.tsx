import {
  BottomSheetFooter,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet'
import { memo, useCallback } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors } from '@/styles'
import { styles } from './styles'

export interface SheetFooterActionsProps {
  confirmLabel: string
  onConfirm: () => void
  confirming?: boolean
  cancelLabel?: string
  onCancel?: () => void
  tone?: 'primary' | 'danger'
}

export const SheetFooterActions = memo(function SheetFooterActions({
  animatedFooterPosition,
  confirmLabel,
  onConfirm,
  confirming = false,
  cancelLabel,
  onCancel,
  tone = 'primary',
}: SheetFooterActionsProps & BottomSheetFooterProps) {
  const hasCancel = Boolean(cancelLabel && onCancel)
  return (
    <BottomSheetFooter
      animatedFooterPosition={animatedFooterPosition}
      style={styles.footer}
    >
      <View style={styles.actions}>
        {hasCancel ? (
          <Pressable
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            onPress={onCancel}
            disabled={confirming}
          >
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={({ pressed }) => [
            styles.confirmButton,
            tone === 'danger' ? styles.dangerButton : styles.primaryButton,
            pressed && styles.pressed,
            confirming && styles.disabled,
          ]}
          onPress={onConfirm}
          disabled={confirming}
          accessibilityRole="button"
        >
          <Text style={styles.confirmText}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </BottomSheetFooter>
  )
})

export function useSheetFooterActions(props: SheetFooterActionsProps) {
  const {
    confirmLabel,
    onConfirm,
    confirming,
    cancelLabel,
    onCancel,
    tone,
  } = props
  return useCallback(
    (footerProps: BottomSheetFooterProps) => (
      <SheetFooterActions
        {...footerProps}
        confirmLabel={confirmLabel}
        onConfirm={onConfirm}
        confirming={confirming}
        cancelLabel={cancelLabel}
        onCancel={onCancel}
        tone={tone}
      />
    ),
    [confirmLabel, onConfirm, confirming, cancelLabel, onCancel, tone],
  )
}

export const sheetFooterColors = {
  primary: colors.blue.base,
  danger: colors.danger.base,
} as const
