import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.blue.base,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingVertical: 13,
    paddingHorizontal: 20,
  },
  ctaButtonText: {
    ...textStyles.buttonLabel,
    color: colors.white,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  allChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  allChipActive: {
    backgroundColor: colors.blue.base,
    borderColor: colors.blue.base,
  },
  allChipText: {
    ...textStyles.badgeLabel,
    color: colors.gray[600],
  },
  allChipTextActive: {
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
})
