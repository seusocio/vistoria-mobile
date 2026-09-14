import { PressableProps } from 'react-native'

export interface CheckboxProps extends PressableProps {
  label: string | React.ReactNode
  checked?: boolean
  onToggle?: () => void
  disabled?: boolean
}
