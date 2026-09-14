import Svg, { Path, SvgProps } from 'react-native-svg'

export const Repeat = ({
  width = 24,
  height = 24,
  color = '#000',
  ...props
}: SvgProps) => (
  <Svg width={width} height={height} viewBox="0 0 32 32" fill="none" {...props}>
    <Path
      fill={color}
      d="M8 5a1 1 0 0 1 1 1v3h13a5 5 0 0 1 5 5v2a1 1 0 1 1-2 0v-2a3 3 0 0 0-3-3H9v3a1 1 0 0 1-1.65.76l-5-4.2a1 1 0 0 1 0-1.53l5-4.2A1 1 0 0 1 8 5"
    />
    <Path
      fill={color}
      d="M24 27a1 1 0 0 1-1-1v-3H10a5 5 0 0 1-5-5v-2a1 1 0 1 1 2 0v2a3 3 0 0 0 3 3h13v-3a1 1 0 0 1 1.65-.76l5 4.2a1 1 0 0 1 0 1.53l-5 4.2A1 1 0 0 1 24 27"
    />
  </Svg>
)
