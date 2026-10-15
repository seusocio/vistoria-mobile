import { FC } from 'react'
import { iconRegistry } from './registry'
import { IconProps } from './types'

export const Icon: FC<IconProps> = ({
  name,
  width = 24,
  height = 24,
  color = '#000',
  size,
  weight = 'regular',
  ...props
}) => {
  const definition = iconRegistry[name]

  if (!definition) {
    console.warn(`Icon "${name}" not found in registry`)
    return null
  }

  const Glyph = definition.component

  return (
    <Glyph
      size={size ?? Math.max(width, height)}
      color={color}
      weight={definition.weight ?? weight}
      {...props}
    />
  )
}
