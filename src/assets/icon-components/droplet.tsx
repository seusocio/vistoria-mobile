import Svg, { Path, SvgProps } from 'react-native-svg'

export const Droplet = ({
  width = 24,
  height = 24,
  color = '#000',
  ...props
}: SvgProps) => (
  <Svg width={width} height={height} viewBox="0 0 32 32" fill="none" {...props}>
    <Path
      fill={color}
      d="M16 3s9 10.163 9 16.2C25 24.06 20.97 28 16 28S7 24.06 7 19.2C7 13.163 16 3 16 3"
    />
  </Svg>
)
