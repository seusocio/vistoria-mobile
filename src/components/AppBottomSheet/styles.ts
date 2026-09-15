import { StyleSheet } from 'react-native'
import { colors, radius } from '@/styles'

export const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.gray[200],
  },
  handleIndicator: {
    backgroundColor: colors.gray[400],
    width: 36,
    height: 4,
    borderRadius: radius.sm,
  },
})
