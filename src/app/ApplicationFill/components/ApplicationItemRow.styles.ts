import { StyleSheet } from 'react-native'
import { colors, fontFamily, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  // Overrides ItemCard's default card look (tinted bg, all-around border,
  // radius) with a flat, full-bleed row divided only by a bottom hairline -
  // this screen's rows sit in an edge-to-edge list, not a stack of cards.
  rowContainer: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    // The thinnest line the device can render - Linear's own dividers are
    // sub-pixel hairlines, not a flat 1pt rule.
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
    borderRadius: 0,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Regular weight, distinct from the section header's bold title - the app
  // only ships a regular/bold pair of fonts, so weight is the one lever that
  // actually separates "section" from "item" in the hierarchy.
  title: {
    fontSize: 14,
    fontFamily: fontFamily.regular,
    color: colors.ink.base,
    flex: 1,
  },
  statusLabel: {
    ...textStyles.metaLabel,
  },
  // Linear fades completed/canceled rows instead of hiding them - the status
  // dot stays fully saturated (it's the actual signal), everything else mutes.
  completedContent: {
    opacity: 0.5,
  },
})
