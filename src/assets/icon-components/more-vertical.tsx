import Svg, { Circle, SvgProps } from 'react-native-svg'

export const MoreVertical = ({
  width = 24,
  height = 24,
  color = '#000',
  ...props
}: SvgProps) => (
  <Svg width={width} height={height} viewBox="0 0 32 32" fill="none" {...props}>
    <Circle cx={16} cy={7} r={2.4} fill={color} />
    <Circle cx={16} cy={16} r={2.4} fill={color} />
    <Circle cx={16} cy={25} r={2.4} fill={color} />
  </Svg>
)
