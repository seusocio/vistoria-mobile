import { StyleSheet } from 'react-native'
import { colors, radius, space, textStyles, touch } from '@/styles'

export const styles = StyleSheet.create({
  footer: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    shadowColor: colors.ink.base,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  cancelButton: {
    minHeight: touch.min,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  confirmButton: {
    minHeight: touch.min,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  primaryButton: {
    backgroundColor: colors.blue.base,
  },
  dangerButton: {
    backgroundColor: colors.danger.base,
  },
  cancelText: {
    ...textStyles.buttonLabel,
    color: colors.gray[600],
  },
  confirmText: {
    ...textStyles.buttonLabel,
    color: colors.white,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.55,
  },
})
