import Svg, { Circle, Path, SvgProps } from 'react-native-svg'

export const User = ({
  width = 24,
  height = 24,
  color = '#000',
  ...props
}: SvgProps) => (
  <Svg width={width} height={height} viewBox="0 0 32 32" fill="none" {...props}>
    <Circle cx={16} cy={10} r={6} fill={color} />
    <Path
      fill={color}
      d="M16 20c-6.075 0-11 4.03-11 9a1 1 0 1 0 2 0c0-3.79 3.94-7 9-7s9 3.21 9 7a1 1 0 1 0 2 0c0-4.97-4.925-9-11-9"
    />
  </Svg>
)
