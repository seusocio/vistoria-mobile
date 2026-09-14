import Svg, { Rect, SvgProps } from 'react-native-svg'

export const BarChart = ({
  width = 24,
  height = 24,
  color = '#000',
  ...props
}: SvgProps) => (
  <Svg width={width} height={height} viewBox="0 0 32 32" fill="none" {...props}>
    <Rect x={5} y={17} width={6} height={11} rx={1.5} fill={color} />
    <Rect x={13} y={10} width={6} height={18} rx={1.5} fill={color} />
    <Rect x={21} y={4} width={6} height={24} rx={1.5} fill={color} />
  </Svg>
)
