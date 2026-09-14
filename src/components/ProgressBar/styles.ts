import { StyleSheet } from 'react-native'
import { colors } from '@/styles'

export const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: 8,
    gap: 3,
  },
  filled: {
    backgroundColor: colors.blue.base,
    borderRadius: 4,
    borderCurve: 'continuous',
    height: 8,
  },
  empty: {
    backgroundColor: colors.gray[200],
    borderRadius: 4,
    borderCurve: 'continuous',
    height: 8,
  },
})
