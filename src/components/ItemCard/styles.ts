import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  itemShell: {
    // borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    // borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRightColor: colors.gray[100],
    borderLeftColor: colors.gray[100],
    gap: 8,
    padding: 12,
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...textStyles.badgeLabel,
    color: colors.gray[600],
  },
  content: {
    flex: 1,
    gap: 3,
  },
  title: {
    ...textStyles.itemTitle,
  },
  description: {
    ...textStyles.body,
  },
  placeholderText: {
    color: colors.gray[400],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    ...textStyles.metaLabel,
  },
  actions: {
    flexDirection: 'row',
    gap: 5,
  },
  trailingButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcriptSuggestionShell: {
    minHeight: 62,
    paddingHorizontal: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.blue.tint,
  },
  transcriptSuggestionLabel: {
    ...textStyles.cardTitle,
    color: colors.blue.base,
  },
  transcriptSuggestionActions: {
    flexDirection: 'row',
    gap: 10,
  },
  transcriptSuggestionAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  transcriptSuggestionActionPressed: {
    opacity: 0.65,
  },
})
