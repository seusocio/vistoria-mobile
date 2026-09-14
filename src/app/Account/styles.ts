import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: colors.blue.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...textStyles.cardTitle,
  },
  text: {
    ...textStyles.body,
    textAlign: 'center',
  },
})
