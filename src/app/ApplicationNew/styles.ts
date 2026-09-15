import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  title: {
    ...textStyles.screenTitle,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    ...textStyles.fieldLabel,
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  helperText: {
    ...textStyles.metaLabel,
    flex: 1,
  },
  error: {
    ...textStyles.body,
    color: colors.danger.base,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.blue.base,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingVertical: 13,
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    ...textStyles.buttonLabel,
    color: colors.white,
  },
})
