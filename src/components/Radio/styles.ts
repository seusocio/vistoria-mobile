import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.gray[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.blue.base,
    backgroundColor: colors.blue.base,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 5,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
  },
  label: {
    ...textStyles.body,
    flex: 1,
  },
  labelDisabled: {
    color: colors.gray[400],
  },
})
