import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    // Hugs its label instead of spanning the gutter: the pill floats over the
    // content now, so its width is the only thing telling you how much of the
    // screen it is actually covering.
    alignSelf: 'center',
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: colors.blue.base,
    // Without a bar behind it, the shadow is the only thing separating the
    // pill from whatever row happens to be under it.
    shadowColor: colors.ink.base,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  pillPressed: {
    opacity: 0.85,
  },
  pillDisabled: {
    opacity: 0.5,
  },
  label: {
    ...textStyles.buttonLabel,
    color: colors.white,
  },
})
