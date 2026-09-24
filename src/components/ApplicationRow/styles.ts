import { StyleSheet } from 'react-native'
import { colors, rule, textStyles } from '@/styles'

/**
 * A full-bleed card: it spans the screen, and everything inside it spans the
 * card. No side gutter, no radius, no side borders - a hairline is the only
 * thing separating one group from the next, which is what lets a row highlight
 * edge-to-edge when pressed instead of a strip floating inside a box.
 *
 * The 20pt horizontal padding is the app's gutter (Screen's nav row, the
 * Collapsible section bar), so a card's title sits on the same vertical rule
 * as the screen title above it. It lives on each row rather than on the card,
 * because a row that stops short of the edge cannot highlight to it.
 *
 * Both history layouts share this, and only this. What goes inside the card is
 * where they disagree - see ./dense.styles.ts.
 */
export const sharedStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    borderBottomWidth: rule,
    borderBottomColor: colors.gray[200],
  },
  // A pressed full-width row tints rather than fading: at this width `opacity`
  // dims the hairlines around it too and the whole card flickers.
  rowPressed: {
    backgroundColor: colors.gray[100],
  },
})

/** The `detailed` layout's own styles. */
export const styles = StyleSheet.create({
  marker: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: colors.blue.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSubtitle: {
    ...textStyles.metaLabel,
  },
  headerStatusDraft: {
    ...textStyles.metaLabel,
    color: colors.warning.base,
    fontFamily: textStyles.badgeLabel.fontFamily,
  },
  headerStatusCompleted: {
    ...textStyles.metaLabel,
    color: colors.success.base,
    fontFamily: textStyles.badgeLabel.fontFamily,
  },
  divider: {
    height: rule,
    backgroundColor: colors.gray[200],
  },
  editTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: rule,
    borderBottomColor: colors.gray[200],
  },
  editTagsText: {
    ...textStyles.badgeLabel,
    color: colors.blue.base,
  },
  historyLabel: {
    ...textStyles.tabLabel,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  visitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  visitRowDivided: {
    borderBottomWidth: rule,
    borderBottomColor: colors.gray[200],
  },
  dateTextStrong: {
    ...textStyles.bodyStrong,
    flex: 1,
  },
  dateText: {
    ...textStyles.body,
    flex: 1,
  },
  negPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  negPillSuccess: {
    backgroundColor: colors.success.tint,
  },
  negPillSuccessText: {
    ...textStyles.badgeLabel,
    color: colors.success.base,
  },
  negPillWarning: {
    backgroundColor: colors.warning.tint,
  },
  negPillWarningText: {
    ...textStyles.badgeLabel,
    color: colors.warning.base,
  },
  // The one thing inside the card that is deliberately *not* full-bleed: a
  // button that runs to the screen edge stops reading as a button.
  repeatButton: {
    height: 44,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 20,
    borderRadius: 13,
    borderCurve: 'continuous',
    backgroundColor: colors.blue.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  repeatButtonHighlight: {
    backgroundColor: colors.danger.base,
  },
  repeatButtonText: {
    ...textStyles.buttonLabel,
  },
})
