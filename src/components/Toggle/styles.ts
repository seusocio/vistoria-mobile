import { StyleSheet } from 'react-native'
import { colors } from '@/styles'

export const styles = StyleSheet.create({
  container: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unselected: {
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  positive: {
    backgroundColor: colors.success.base,
  },
  negative: {
    backgroundColor: colors.danger.base,
  },
  neutral: {
    backgroundColor: colors.warning.base,
  },
})
