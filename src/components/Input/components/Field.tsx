import { forwardRef } from 'react'
import {
  NativeSyntheticEvent,
  TargetedEvent,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SheetAwareTextInput } from '../../SheetAwareTextInput'
import { useInputContext } from '../hooks/InputContext'
import { styles } from '../styles'
import { InputFieldProps } from '../types'
import { Icon } from './Icon'

export const Field = forwardRef<TextInput, InputFieldProps>(function Field({
  variant,
  state,
  style,
  onFocus,
  onBlur,
  value,
  onChangeValue,
  rows,
  min,
  max,
  step,
  disabled,
  ...props
}, ref) {
  const context = useInputContext()
  const finalVariant = variant || context.variant

  const textInputStyle = [
    finalVariant === 'percentage'
      ? styles.percentageTextInput
      : finalVariant === 'textarea'
        ? styles.textareaInput
        : styles.textInput,
    finalVariant === 'percentage' && { textAlign: 'center' as const },
    finalVariant === 'textarea' && {
      textAlignVertical: 'top' as const,
      height: (rows || 3) * 20 + 16,
    },
    style,
  ]

  const handleFocus = (e: NativeSyntheticEvent<TargetedEvent>) => {
    context.handleFocus()
    onFocus?.(e)
  }

  const handleBlur = (e: NativeSyntheticEvent<TargetedEvent>) => {
    context.handleBlur()
    onBlur?.(e)
  }

  // Quantity handlers
  const handleIncrement = () => {
    if (disabled) return
    const currentValue = typeof value === 'number' ? value : 1
    const nextValue = Math.min(currentValue + (step || 1), max || 999)
    onChangeValue?.(nextValue)
  }

  const handleDecrement = () => {
    if (disabled) return
    const currentValue = typeof value === 'number' ? value : 1
    const nextValue = Math.max(currentValue - (step || 1), min || 0)
    onChangeValue?.(nextValue)
  }

  if (finalVariant === 'quantity') {
    return (
      <View style={[styles.quantityContainer, disabled && styles.disabled]}>
        <Pressable
          style={({ pressed }) => [
            styles.quantityButton,
            disabled && styles.disabledButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleDecrement}
          disabled={
            disabled || (typeof value === 'number' ? value <= (min || 1) : true)
          }
        >
          <Icon name="minus" size={20} />
        </Pressable>
        <Text style={[styles.quantityText, disabled && styles.disabledText]}>
          {typeof value === 'number' ? value : 1}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.quantityButton,
            disabled && styles.disabledButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleIncrement}
          disabled={
            disabled ||
            (typeof value === 'number' ? value >= (max || 999) : true)
          }
        >
          <Icon name="plus" size={20} />
        </Pressable>
      </View>
    )
  }

  return (
    <SheetAwareTextInput
      ref={ref}
      style={textInputStyle}
      placeholderTextColor={styles.placeholderText.color}
      keyboardType={
        finalVariant === 'percentage' || finalVariant === 'currency'
          ? 'numeric'
          : 'default'
      }
      multiline={finalVariant === 'textarea'}
      numberOfLines={finalVariant === 'textarea' ? rows || 3 : undefined}
      value={typeof value === 'number' ? value.toString() : value || ''}
      onChangeText={onChangeValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...props}
    />
  )
})
