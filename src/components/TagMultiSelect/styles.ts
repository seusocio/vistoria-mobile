import { StyleSheet } from 'react-native'
import { colors, radius, space, textStyles, touch } from '@/styles'

export const styles = StyleSheet.create({
  row: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  rowAccent: {
    borderColor: colors.blue.base,
    borderWidth: 1.5,
  },
  rowMuted: {
    backgroundColor: colors.gray[100],
  },
  rowContent: {
    flex: 1,
    gap: space.xs,
  },
  rowTapArea: {
    minHeight: touch.min,
    justifyContent: 'center',
  },
  rowChevron: {
    minWidth: touch.min,
    minHeight: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -space.sm,
    marginRight: -space.sm,
  },
  rowLabel: {
    ...textStyles.fieldLabel,
    color: colors.gray[600],
  },
  rowValue: {
    ...textStyles.body,
    color: colors.ink.base,
  },
  rowValueEmpty: {
    ...textStyles.body,
    color: colors.gray[400],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  sheetFooter: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  sheetContent: {
    gap: space.sm,
    padding: space.lg,
    paddingBottom: space.xxl,
  },
  sheetTitle: {
    ...textStyles.sectionTitle,
    color: colors.ink.base,
  },
  sheetSubtitle: {
    ...textStyles.body,
    color: colors.gray[600],
  },
  selectedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    paddingVertical: space.xs,
  },
  searchBox: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.gray[100],
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
  },
  searchInput: {
    flex: 1,
    ...textStyles.inputValue,
    color: colors.ink.base,
    padding: 0,
  },
  options: {
    gap: space.xs,
  },
  option: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  optionText: {
    ...textStyles.body,
    color: colors.ink.base,
  },
  check: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: radius.sm,
  },
  checkSelected: {
    backgroundColor: colors.blue.base,
    borderColor: colors.blue.base,
  },
  createText: {
    ...textStyles.body,
    fontFamily: textStyles.bodyStrong.fontFamily,
    color: colors.blue.base,
  },
  emptyText: {
    ...textStyles.body,
    color: colors.gray[600],
    paddingVertical: space.lg,
    textAlign: 'center',
  },
  doneButton: {
    minHeight: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue.base,
    borderRadius: radius.md,
    marginTop: space.md,
  },
  doneButtonText: {
    ...textStyles.buttonLabel,
    color: colors.white,
  },
})
