import { StyleSheet } from 'react-native'
import { colors, space, textStyles, touch } from '@/styles'

/** The pill and the action circle share one optical weight. */
const shadow = {
  shadowColor: colors.ink.base,
  shadowOpacity: 0.18,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 6,
} as const

export const styles = StyleSheet.create({
  bar: {
    // Pinned over the scene, not laid out beside it: react-navigation renders
    // the tab bar as a sibling of the screen container, so absolute here means
    // absolute over the whole navigator.
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingTop: space.sm,
    paddingHorizontal: space.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
    // The pill sits on a white screen, so the shadow alone would leave its top
    // edge undefined. The hairline is what actually draws the shape.
    borderWidth: 1,
    borderColor: colors.gray[200],
    ...shadow,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 64,
    height: touch.min,
    paddingHorizontal: space.md,
    borderRadius: 999,
    borderCurve: 'continuous',
  },
  tabFocused: {
    backgroundColor: colors.blue.tint,
  },
  label: {
    ...textStyles.tabLabel,
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: colors.blue.base,
    ...shadow,
  },
  pressed: {
    opacity: 0.85,
  },
})
