import { StyleSheet } from 'react-native'
import { colors, radius, space, textStyles, touch } from '@/styles'

export const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
    gap: space.sm,
  },
  listHeader: {
    gap: space.lg,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  ctaButton: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.blue.base,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: space.xl,
  },
  ctaButtonText: {
    ...textStyles.buttonLabel,
    color: colors.white,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  filterButton: {
    minWidth: touch.min,
    minHeight: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: colors.gray[100],
    borderRadius: radius.md,
  },
  filterButtonActive: {
    backgroundColor: colors.blue.tint,
  },
  filterBadge: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: space.sm,
    height: space.sm,
    backgroundColor: colors.blue.base,
    borderRadius: space.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  filterSheet: {
    gap: space.xs,
    padding: space.lg,
    paddingBottom: space.xxl,
  },
  filterSheetTitle: {
    ...textStyles.sectionTitle,
    color: colors.ink.base,
    marginBottom: space.xs,
  },
  filterSheetSubtitle: {
    ...textStyles.body,
    color: colors.gray[600],
    marginBottom: space.sm,
  },
  filterOption: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  filterOptionActive: {
    backgroundColor: colors.gray[100],
  },
  filterOptionText: {
    ...textStyles.body,
    color: colors.ink.base,
  },
  sectionTitle: {
    ...textStyles.sectionTitle,
  },
  emptyState: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: space.xl,
  },
  emptyText: {
    ...textStyles.body,
    textAlign: 'center',
  },
  clearFiltersButton: {
    alignSelf: 'center',
    minHeight: touch.min,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  clearFiltersText: {
    ...textStyles.bodyStrong,
    color: colors.blue.base,
  },
})
