import { memo } from 'react'
import type { ResponseOption } from '@/infra/domain/entities'
import { Toggle } from '../Toggle'

export const AnswerToggleRow = memo(function AnswerToggleRow({
  option,
  selected,
  onPress,
}: {
  option: ResponseOption
  selected: boolean
  onPress: () => void
}) {
  return (
    <Toggle
      semantic={option.semantic}
      selected={selected}
      onPress={onPress}
      accessibilityLabel={option.label}
      size={26}
    />
  )
})
