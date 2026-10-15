import { StyleSheet } from 'react-native'
import { colors, radius, space, textStyles, touch } from '@/styles'

export const styles = StyleSheet.create({
  // Rows run to the screen edge (see ChecklistListItem), so the gutter lives
  // on the header and the empty state rather than on the list.
  listContent: {
    paddingTop: space.lg,
    paddingBottom: space.xxl,
  },
  listHeader: {
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  // Rows carry their rule on the top edge, so the list needs one more to
  // close the last one - same as the checklist history.
  listEndRule: {
    height: 1,
    backgroundColor: colors.gray[200],
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
  emptyState: {
    marginHorizontal: space.lg,
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
