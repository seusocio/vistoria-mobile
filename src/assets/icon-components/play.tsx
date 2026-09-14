import Svg, { Path, SvgProps } from 'react-native-svg'

export const Play = ({
  width = 24,
  height = 24,
  color = '#000',
  ...props
}: SvgProps) => (
  <Svg width={width} height={height} viewBox="0 0 32 32" fill="none" {...props}>
    <Path
      fill={color}
      d="M9 6.5a1.5 1.5 0 0 1 2.28-1.28l14 8.5a1.5 1.5 0 0 1 0 2.56l-14 8.5A1.5 1.5 0 0 1 9 25.5z"
    />
  </Svg>
)
