import { SvgProps } from 'react-native-svg'

export type IconName =
  | 'alert-triangle'
  | 'bar-chart'
  | 'calendar'
  | 'camera'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'clipboard-check'
  | 'copy'
  | 'credit-card'
  | 'direction-up-right'
  | 'droplet'
  | 'edit-pen'
  | 'filter'
  | 'grip-vertical'
  | 'mic'
  | 'minus'
  | 'multiply'
  | 'note-with-text'
  | 'play'
  | 'plus'
  | 'repeat'
  | 'search'
  | 'shop'
  | 'square'
  | 'tag'
  | 'trash-2'
  | 'user'

export interface IconProps extends SvgProps {
  name: IconName
  width?: number
  height?: number
  color?: string
  size?: number
}
