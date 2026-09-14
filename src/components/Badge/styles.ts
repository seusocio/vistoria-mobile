import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderCurve: 'continuous',
  },
  label: {
    ...textStyles.badgeLabel,
  },
  draft: { backgroundColor: colors.warning.tint },
  draftLabel: { color: colors.warning.base },
  completed: { backgroundColor: colors.success.tint },
  completedLabel: { color: colors.success.base },
})
