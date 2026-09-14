import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

const baseSecondaryStyle = {
  backgroundColor: colors.gray[100],
  borderWidth: 1,
  borderColor: colors.gray[200],
}

export const styles = StyleSheet.create({
  // Base button container - Component/Button/Primary & Outline
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 999,
    borderCurve: 'continuous',
    gap: 8,
  },

  primary: {
    backgroundColor: colors.blue.base,
  },

  secondary: baseSecondaryStyle,

  danger: {
    ...baseSecondaryStyle,
    borderColor: colors.danger.base,
  },

  primaryText: {
    ...textStyles.buttonLabel,
    color: colors.white,
  },

  secondaryText: {
    ...textStyles.buttonLabel,
    color: colors.blue.base,
  },

  dangerText: {
    ...textStyles.buttonLabel,
    color: colors.danger.base,
  },

  primaryIconColor: {
    color: colors.white,
  },

  secondaryIconColor: {
    color: colors.blue.base,
  },

  dangerIconColor: {
    color: colors.danger.base,
  },

  iconOnly: {
    width: 48,
    height: 48,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
})
