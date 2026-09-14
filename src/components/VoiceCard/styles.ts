import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.blue.tint,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 16,
    gap: 10,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
    gap: 1,
  },
  title: {
    ...textStyles.itemTitle,
  },
  sub: {
    ...textStyles.body,
  },
  transcript: {
    ...textStyles.body,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.blue.base,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingVertical: 13,
    paddingHorizontal: 20,
  },
  dangerButton: {
    backgroundColor: colors.danger.base,
  },
  primaryButtonText: {
    ...textStyles.buttonLabel,
    color: colors.white,
  },
})
