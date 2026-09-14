import Svg, { Rect, SvgProps } from 'react-native-svg'

export const Square = ({
  width = 24,
  height = 24,
  color = '#000',
  ...props
}: SvgProps) => (
  <Svg width={width} height={height} viewBox="0 0 32 32" fill="none" {...props}>
    <Rect x={8} y={8} width={16} height={16} rx={3} fill={color} />
  </Svg>
)
