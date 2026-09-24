import { StyleSheet } from 'react-native'
import { FLOATING_ACTION_CLEARANCE } from '@/components/FloatingAction'
import { colors, radius, space, textStyles, touch } from '@/styles'

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
    // The cards below run to the screen edge, so the gutter lives here rather
    // than on the list - and at 20 the checklist title lines up with the nav
    // title above it and with every card title below.
    paddingHorizontal: 20,
  },
  listContent: {
    paddingTop: 16,
    // This screen brings its own scroll container, so Screen's
    // contentWithFloatingAction doesn't reach it - the clearance under the
    // "Nova aplicação" pill is paid for here instead.
    paddingBottom: FLOATING_ACTION_CLEARANCE,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sectionTitle: {
    ...textStyles.sectionTitle,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  layoutToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  layoutToggleText: {
    ...textStyles.badgeLabel,
    color: colors.gray[600],
  },
  historySearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm
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
  list: {
    gap: 10,
  },
  // Cards carry their rule on the top edge (see ApplicationRow's sharedStyles),
  // so the list needs one more to close the last one.
  listEndRule: {
    height: 1,
    backgroundColor: colors.gray[200],
  },
  emptyState: {
    marginHorizontal: 20,
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
