import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

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
  /**
   * The separating rule is on the **top** edge, and it is 1 rather than
   * `StyleSheet.hairlineWidth`. Both are deliberate, and both are defences
   * against the same reported bug: on a @3x device, dividers went missing in a
   * repeating pattern - two drawn, one skipped, all the way down the list.
   *
   * Two mechanisms can each produce that, and **it was never isolated which
   * one was actually at fault** (the build under test turned out to be stale,
   * so the single-variable attempts proved nothing). Both defences are
   * therefore kept:
   *
   * - *Top, not bottom.* LegendList renders every item into its own
   *   absolutely positioned container, placed from sizes it measures and
   *   caches. A card whose real height disagrees with its cached height by a
   *   rounding step lets the next container sit slightly early and overlap
   *   this one - and every card paints an opaque background, so the overlap
   *   covers whatever is on this card's bottom edge. The top edge is drawn by
   *   the container that would be doing the covering, so it survives.
   * - *1, not hairlineWidth.* `hairlineWidth` is `1 / PixelRatio.get()`: a
   *   single physical pixel, which rounds away completely at some sub-pixel
   *   offsets. 1dp is three physical pixels at @3x and cannot vanish.
   *
   * Do not drop either one to "simplify" without re-testing on a real @3x
   * device - a simulator at @2x shows neither the bug nor the fix.
   */
  container: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
  },
  /** Nothing above the first card to separate it from - see `first`. */
  containerFirst: {
    borderTopWidth: 0,
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
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.gray[200],
  },
  editTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
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
