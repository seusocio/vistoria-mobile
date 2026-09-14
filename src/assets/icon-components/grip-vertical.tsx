import Svg, { Circle, SvgProps } from 'react-native-svg'

export const GripVertical = ({
  width = 24,
  height = 24,
  color = '#000',
  ...props
}: SvgProps) => (
  <Svg width={width} height={height} viewBox="0 0 32 32" fill="none" {...props}>
    <Circle cx={12} cy={8} r={2} fill={color} />
    <Circle cx={12} cy={16} r={2} fill={color} />
    <Circle cx={12} cy={24} r={2} fill={color} />
    <Circle cx={20} cy={8} r={2} fill={color} />
    <Circle cx={20} cy={16} r={2} fill={color} />
    <Circle cx={20} cy={24} r={2} fill={color} />
  </Svg>
)
