import Svg, { Circle, Path, SvgProps } from 'react-native-svg'

export const AlertTriangle = ({
  width = 24,
  height = 24,
  color = '#000',
  ...props
}: SvgProps) => (
  <Svg width={width} height={height} viewBox="0 0 32 32" fill="none" {...props}>
    <Path
      fill={color}
      d="M13.19 4.98a3.2 3.2 0 0 1 5.62 0l.09.17 10.4 19.85A3.2 3.2 0 0 1 26.5 30H5.5a3.2 3.2 0 0 1-2.8-4.99zM16 8l-9.9 18.9a1.2 1.2 0 0 0 1.06 1.76v.001H26.5c.883 0 1.435-.947 1.06-1.76z"
    />
    <Circle cx={16} cy={22} r={1.4} fill={color} />
    <Path
      fill={color}
      d="M16 12a1.2 1.2 0 0 1 1.2 1.2v5.3a1.2 1.2 0 1 1-2.4 0v-5.3A1.2 1.2 0 0 1 16 12"
    />
  </Svg>
)
