import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  field: {
    gap: 8,
  },
  fieldLabel: {
    ...textStyles.fieldLabel,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  presetChipActive: {
    backgroundColor: colors.blue.base,
    borderColor: colors.blue.base,
  },
  presetChipText: {
    ...textStyles.badgeLabel,
    color: colors.gray[600],
  },
  presetChipTextActive: {
    color: colors.white,
  },
  customRangeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateField: {
    flex: 1,
    gap: 6,
  },
  dateFieldLabel: {
    ...textStyles.metaLabel,
    color: colors.gray[600],
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendTitle: {
    ...textStyles.sectionTitle,
  },
  pendCount: {
    ...textStyles.badgeLabel,
    color: colors.gray[400],
  },
  pendList: {
    gap: 12,
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
})
