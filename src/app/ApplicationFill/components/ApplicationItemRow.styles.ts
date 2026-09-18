import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

/**
 * Only what's specific to an application row. The row shell and title come
 * from Collapsible.Row / Collapsible.RowTitle - the accordion owns that
 * design, this file must not restate it.
 */
export const styles = StyleSheet.create({
  // Kept as StyleSheet entries rather than inline objects: an object literal in
  // render is a new style on every pass, which defeats the row's memo() and
  // re-uploads the style to the native side for nothing.
  suggestedRow: {
    backgroundColor: colors.blue.tint,
  },
  suggestionShell: {
    padding: 6,
    paddingBottom: 0,
    backgroundColor: colors.blue.tint,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
