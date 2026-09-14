import { StyleSheet } from 'react-native'
import { colors } from '@/styles'

export const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleIndicator: {
    backgroundColor: colors.gray[200],
    width: 40,
  },
})
