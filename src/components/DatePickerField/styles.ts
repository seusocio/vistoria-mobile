import { StyleSheet } from 'react-native'
import { colors, textStyles } from '@/styles'

export const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  pressed: {
    opacity: 0.7,
  },
  value: {
    ...textStyles.inputValue,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  modalTitle: {
    ...textStyles.sectionTitle,
    marginBottom: 8,
  },
  picker: {
    alignSelf: 'center',
  },
})
