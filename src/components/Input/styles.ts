import { StyleSheet, ViewStyle } from 'react-native'
import { colors, textStyles } from '@/styles'

const baseInputStyle: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  borderWidth: 1,
  borderRadius: 999,
  borderCurve: 'continuous',
  paddingHorizontal: 14,
  height: 48,
  gap: 8,
}

export const styles = StyleSheet.create({
  container: {
    ...baseInputStyle,
    backgroundColor: colors.gray[100],
    borderColor: colors.gray[200],
  },

  empty: {
    borderColor: colors.gray[200],
  },

  filled: {
    borderColor: colors.blue.base,
  },

  danger: {
    borderColor: colors.danger.base,
  },

  percentage: {
    borderColor: colors.gray[200],
  },

  textarea: {
    height: 'auto',
    minHeight: 80,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    borderCurve: 'continuous',
  },

  currency: {},

  quantity: {
    paddingHorizontal: 8,
  },

  focus: {
    borderColor: colors.blue.base,
  },

  emptyNestedComponentColor: {
    color: colors.gray[600],
  },

  emptyFocusNestedComponentColor: {
    color: colors.blue.base,
  },

  filledNestedComponentColor: {
    color: colors.gray[600],
  },

  filledFocusNestedComponentColor: {
    color: colors.blue.base,
  },

  dangerNestedComponentColor: {
    color: colors.danger.base,
  },

  dangerFocusNestedComponentColor: {
    color: colors.danger.base,
  },

  percentageNestedComponentColor: {
    color: colors.gray[600],
  },

  percentageFocusNestedComponentColor: {
    color: colors.blue.base,
  },

  quantityNestedComponentColor: {
    color: colors.blue.base,
  },

  quantityFocusNestedComponentColor: {
    color: colors.blue.base,
  },

  textInput: {
    flex: 1,
    ...textStyles.inputValue,
    padding: 0,
    lineHeight: textStyles.inputValue.fontSize * 1.2,
    textAlignVertical: 'center',
  },

  percentageTextInput: {
    flex: 1,
    ...textStyles.inputValue,
    lineHeight: textStyles.inputValue.fontSize * 1.2,
    padding: 0,
    textAlign: 'center',
  },

  currencyTextInput: {
    flex: 1,
    ...textStyles.inputValue,
    padding: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    margin: 0,
    lineHeight: textStyles.inputValue.fontSize * 1.2,
    textAlignVertical: 'center',
  },

  textareaInput: {
    flex: 1,
    ...textStyles.inputValue,
    padding: 0,
    textAlignVertical: 'top',
  },

  prefixText: {
    ...textStyles.inputValue,
  },

  placeholderText: {
    color: colors.gray[400],
  },

  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },

  quantityButton: {
    width: 20,
    height: 20,
  },

  quantityText: {
    ...textStyles.inputValue,
    padding: 0,
    textAlign: 'center',
  },

  disabled: {
    opacity: 0.6,
  },

  disabledButton: {
    opacity: 0.3,
  },

  disabledText: {
    color: colors.gray[400],
  },
})
