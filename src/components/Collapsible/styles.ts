import { StyleSheet } from 'react-native'
import { colors, fontFamily, textStyles } from '@/styles'

/**
 * The whole accordion look lives here - header bar, row shell and row title -
 * so a section can't drift from the rows it contains. Screens compose
 * Collapsible.Header / .Row / .RowTitle and add only what's genuinely theirs
 * (a progress ring, a suggestion tint), never a second copy of this design.
 */
export const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  headerPressed: {
    // backgroundColor: colors.gray[100],
  },
  headerTitle: {
    ...textStyles.cardTitle,
    flex: 1,
  },
  headerCount: {
    ...textStyles.metaLabel,
  },
  headerCountSuccess: {
    color: colors.success.base,
  },
  content: {
    overflow: 'hidden',
  },
  // Taken out of flow so the parent's animated height can't squeeze it. The
  // content here is a FlatList (a real ScrollView): give it a parent pinned to
  // `height: 0` and it collapses to nothing and reports a 0 layout, so the
  // section could never measure itself open. Absolute positioning leaves its
  // height auto - driven by content, independent of the parent - while
  // left/right still stretch it to full width.
  measured: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  // Overrides ItemCard's default card look (tinted bg, all-around border,
  // radius) with a flat, full-bleed row divided only by a bottom hairline -
  // accordion rows sit in an edge-to-edge list, not a stack of cards.
  row: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
    borderRadius: 0,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  // Regular weight, distinct from the header's bold title - the app only ships
  // a regular/bold pair, so weight is the one lever that separates "section"
  // from "item" in the hierarchy.
  rowTitle: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
    color: colors.ink.base,
    flex: 1,
  },
})
