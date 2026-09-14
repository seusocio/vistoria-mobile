import CurrencyInput from 'react-native-currency-input'
import { Field } from './components/Field'
import { Icon } from './components/Icon'
import { Prefix } from './components/Prefix'
import { Root } from './components/Root'
import { Suffix } from './components/Suffix'
import { styles } from './styles'
import { InputProps } from './types'

// Legacy Input Component (for backward compatibility)
function Input({
  icon,
  prefix,
  suffix,
  placeholder,
  variant = 'empty',
  width,
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
}: InputProps) {
  // Handle currency variant with CurrencyInput
  if (variant === 'currency') {
    const handleCurrencyChange = (newValue: number | null) => {
      onChangeValue?.(
        newValue !== null && newValue !== undefined ? String(newValue) : '',
      )
    }

    return (
      <Root
        variant={variant}
        width={width}
        onFocus={onFocus}
        onBlur={onBlur}
        {...props}
      >
        <CurrencyInput
          value={typeof value === 'number' ? value : 0}
          onChangeValue={handleCurrencyChange}
          prefix="R$ "
          delimiter="."
          separator=","
          precision={2}
          minValue={0}
          placeholder={placeholder}
          style={styles.currencyTextInput}
          placeholderTextColor={styles.placeholderText.color}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </Root>
    )
  }

  // Handle textarea variant
  if (variant === 'textarea') {
    return (
      <Root
        variant={variant}
        width={width}
        onFocus={onFocus}
        onBlur={onBlur}
        {...props}
      >
        <Field
          placeholder={placeholder}
          value={value}
          onChangeValue={onChangeValue}
          rows={rows}
          disabled={disabled}
        />
      </Root>
    )
  }

  return (
    <Root
      variant={variant}
      width={variant === 'percentage' ? 90 : width}
      onFocus={onFocus}
      onBlur={onBlur}
      {...props}
    >
      {icon ? <Icon name={icon} /> : null}
      {prefix ? <Prefix>{prefix}</Prefix> : null}
      <Field
        placeholder={placeholder}
        value={value}
        onChangeValue={onChangeValue}
        rows={rows}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
      />
      {suffix ? <Suffix>{suffix}</Suffix> : null}
      {variant === 'percentage' && <Suffix>%</Suffix>}
    </Root>
  )
}

// Create compound component
const InputCompound = Object.assign(Input, {
  Root,
  Icon,
  Prefix,
  Suffix,
  Field,
})

// Export compound component and legacy component
export { InputCompound as Input }
