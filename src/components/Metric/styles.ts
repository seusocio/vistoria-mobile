import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 16,
    gap: 4,
  },
  value: {
    ...textStyles.metricValue,
  },
  label: {
    ...textStyles.metricLabel,
  },
  detail: {
    ...textStyles.metaLabel,
  },
})
