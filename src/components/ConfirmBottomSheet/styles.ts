import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 16,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: colors.white,
  },
  title: {
    ...textStyles.drawerTitle,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  confirmButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.danger.base,
  },
  cancelText: {
    ...textStyles.buttonLabel,
    color: colors.ink.base,
  },
  confirmText: {
    ...textStyles.buttonLabel,
    color: colors.white,
  },
  message: {
    ...textStyles.body,
    color: colors.ink.base,
  },
  warning: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.danger.light,
  },
  warningText: {
    ...textStyles.metaLabel,
    color: colors.danger.base,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.55,
  },
})
