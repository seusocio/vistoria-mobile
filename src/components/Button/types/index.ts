import { PressableProps } from 'react-native'
import { IconName } from '../../Icon'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'

export interface BaseButtonProps extends PressableProps {
  variant?: ButtonVariant
}

export interface ButtonRootProps extends BaseButtonProps {
  children: React.ReactNode
}

export interface ButtonIconProps {
  name: IconName
  variant?: ButtonVariant // Optional override
  size?: number
}

export interface ButtonTextProps {
  children: React.ReactNode
  variant?: ButtonVariant // Optional override
}

export interface ButtonProps extends BaseButtonProps {
  title: string
  icon?: IconName
}

export interface IconButtonProps extends BaseButtonProps {
  icon: IconName
}
