import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.gray[100],
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  marker: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderCurve: 'continuous',
    backgroundColor: colors.blue.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: {
    flex: 1,
    gap: 3,
  },
  headerTitle: {
    ...textStyles.itemTitle,
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
  body: {
    gap: 12,
  },
  divider: {
    height: 1,
    backgroundColor: colors.gray[200],
  },
  visitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 44,
  },
  dateTextStrong: {
    ...textStyles.bodyStrong,
  },
  dateText: {
    ...textStyles.body,
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
  historyLabel: {
    ...textStyles.tabLabel,
    paddingLeft: 44,
  },
  historyList: {
    gap: 8,
  },
  editTagsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  editTagsText: {
    ...textStyles.badgeLabel,
    color: colors.blue.base,
  },
  repeatButton: {
    height: 44,
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
