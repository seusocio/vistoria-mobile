import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderCurve: 'continuous',
    maxWidth: 200,
  },
  primary: {
    backgroundColor: colors.blue.tint,
  },
  neutral: {
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  label: {
    ...textStyles.chipLabel,
  },
  primaryLabel: {
    color: colors.blue.base,
  },
  neutralLabel: {
    color: colors.gray[600],
  },
})
