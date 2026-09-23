import { StyleSheet } from 'react-native'
import { textStyles } from '@/styles'

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
})
