import { PressableProps } from 'react-native'

export interface RadioProps extends PressableProps {
  label: string | React.ReactNode
  selected?: boolean
  onSelect?: () => void
  disabled?: boolean
}

export interface UseRadioReturn<T> {
  selectedValue: T | null
  isSelected: (value: T) => boolean
  select: (value: T) => void
  reset: () => void
}
