import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  deleteButtonText: {
    ...textStyles.buttonLabel,
    color: colors.danger.base,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  headerActions: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  headerActionButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editAppButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCol: {
    gap: 8,
  },
  progressText: {
    ...textStyles.bodyStrong,
  },
  gallerySection: {
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: colors.gray[100],
  },
  galleryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  galleryTitle: {
    ...textStyles.bodyStrong,
  },
  gallerySubtitle: {
    ...textStyles.metaLabel,
  },
  galleryReference: {
    ...textStyles.metaLabel,
    color: colors.blue.base,
  },
  galleryPhotosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addPhotoButtonText: {
    ...textStyles.badgeLabel,
    color: colors.blue.base,
  },
  itemsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemsTitle: {
    ...textStyles.sectionTitle,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addItemButtonText: {
    ...textStyles.badgeLabel,
    color: colors.blue.base,
  },
  groupsList: {
    // Cancels the Screen's own 20px horizontal padding so section dividers and
    // rows bleed edge-to-edge, Linear-style - each row/header re-adds its own
    // horizontal padding around its content.
    marginHorizontal: -20,
  },

  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 18,
  },
  sheetFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: colors.white,
  },
  modalField: {
    gap: 8,
  },
  modalFieldLabel: {
    ...textStyles.fieldLabel,
  },
  dateStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dateStepperButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateStepperValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateStepperValue: {
    ...textStyles.inputValue,
  },
  modalError: {
    ...textStyles.body,
    color: colors.danger.base,
  },
  saveAppButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.blue.base,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingVertical: 13,
  },
  saveAppButtonText: {
    ...textStyles.buttonLabel,
    color: colors.white,
  },
})
