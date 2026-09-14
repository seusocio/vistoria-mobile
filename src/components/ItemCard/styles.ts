import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  itemShell: {
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  itemShellTranscriptSuggestion: {
    padding: 6,
    paddingBottom: 0,
    // borderWidth: 1.5,
    // borderColor: colors.blue.base,
    backgroundColor: colors.blue.tint,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: 8,
    padding: 12,
  },
  containerSuggested: {
    backgroundColor: colors.white,
  },
  containerTranscriptSuggestion: {
    backgroundColor: colors.white,
  },
  titleCol: {
    flex: 1,
    gap: 3,
  },
  title: {
    ...textStyles.itemTitle,
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
  suggestedText: {
    ...textStyles.metaLabel,
    fontFamily: textStyles.badgeLabel.fontFamily,
    color: colors.blue.base,
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
  answerToggles: {
    flexDirection: 'row',
    gap: 5,
  },
  moreButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
