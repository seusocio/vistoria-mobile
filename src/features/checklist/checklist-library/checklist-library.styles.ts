import { StyleSheet } from 'react-native'
import { colors, radius, space, textStyles, touch } from '@/styles'

export const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
  },
  itemSeparator: {
    height: space.sm,
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue.base,
    borderRadius: radius.lg,
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
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  filterButtonActive: {
    backgroundColor: colors.blue.tint,
    borderColor: colors.blue.tint,
  },
  filterBadge: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: space.xs,
    height: space.xs,
    backgroundColor: colors.blue.base,
    borderRadius: space.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  filterSheet: {
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
  },
  filterSheetTitle: {
    ...textStyles.drawerTitle,
    color: colors.ink.base,
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
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  filterOptionActive: {
    backgroundColor: colors.blue.tint,
    borderColor: colors.blue.tint,
  },
  filterOptionText: {
    ...textStyles.bodyStrong,
    color: colors.ink.base,
  },
  sectionTitle: {
    ...textStyles.bodyStrong,
    color: colors.gray[600],
    letterSpacing: 0.3,
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
