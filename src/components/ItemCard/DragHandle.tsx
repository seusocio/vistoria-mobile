import { colors } from '@/styles'
import { Icon } from '../Icon'

export function ItemCardDragHandle({ color = colors.gray[400] }: { color?: string }) {
  return <Icon name="grip-vertical" size={18} color={color} />
}
