import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

/**
 * The `dense` layout's own styles. The card shell it sits in is shared with
 * the detailed layout (see `sharedStyles` in ./styles.ts) - the two layouts
 * disagree about their contents, not about what a card is.
 */
export const denseStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.gray[200],
  },
  // A 3pt bar rather than a dot: at this density a dot reads as punctuation.
  tick: { width: 3, height: 16, borderRadius: 2 },
  tickSuccess: { backgroundColor: colors.success.base },
  tickWarning: { backgroundColor: colors.warning.base },
  tickDraft: { backgroundColor: colors.gray[400] },
  rowDate: {
    ...textStyles.bodyStrong,
    flex: 1,
  },
  rowDraft: {
    ...textStyles.metaLabel,
  },
  countOk: {
    ...textStyles.metaLabel,
    minWidth: 22,
    textAlign: 'right',
  },
  countWarn: {
    ...textStyles.badgeLabel,
    color: colors.warning.base,
    minWidth: 22,
    textAlign: 'right',
  },
})
