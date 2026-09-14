import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.33)',
    justifyContent: 'flex-end',
  },
  backdropTouchable: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderCurve: 'continuous',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  content: {
    gap: 18,
  },
  handleRow: {
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    borderCurve: 'continuous',
    backgroundColor: colors.gray[200],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    ...textStyles.badgeLabel,
    color: colors.gray[400],
  },
  title: {
    ...textStyles.drawerTitle,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderCurve: 'continuous',
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    ...textStyles.fieldLabel,
  },
  noteBox: {
    ...textStyles.inputValue,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 12,
    minHeight: 84,
    textAlignVertical: 'top',
  },
  qtyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qtyLabel: {
    ...textStyles.bodyStrong,
  },
  qtyStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addQuantity: {
    ...textStyles.body,
    fontFamily: textStyles.bodyStrong.fontFamily,
    color: colors.blue.base,
  },
  photosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  photosCount: {
    ...textStyles.badgeLabel,
    color: colors.gray[400],
  },
  photosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  footer: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.blue.base,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingVertical: 13,
  },
  saveButtonText: {
    ...textStyles.buttonLabel,
    color: colors.white,
  },
})
