import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActionButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    gap: 8,
  },
  title: {
    ...textStyles.screenTitle,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  listHeader: {
    gap: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  listSeparator: {
    height: 10,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  newAppButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.blue.base,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingVertical: 13,
  },
  newAppButtonText: {
    ...textStyles.buttonLabel,
    color: colors.white,
  },
  sectionTitle: {
    ...textStyles.sectionTitle,
  },
  list: {
    gap: 10,
  },
  emptyState: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 24,
  },
  emptyText: {
    ...textStyles.body,
    textAlign: 'center',
  },
  batchContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 16,
  },
  batchHelpText: {
    ...textStyles.body,
    color: colors.gray[600],
  },
  batchFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  saveTagsButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.blue.base,
  },
  saveTagsButtonText: {
    ...textStyles.buttonLabel,
    color: colors.white,
  },
})
