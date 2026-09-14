import Svg, { Path, SvgProps } from 'react-native-svg'

export const Mic = ({
  width = 24,
  height = 24,
  color = '#000',
  ...props
}: SvgProps) => (
  <Svg width={width} height={height} viewBox="0 0 32 32" fill="none" {...props}>
    <Path
      fill={color}
      d="M16 4a4 4 0 0 0-4 4v9a4 4 0 0 0 8 0V8a4 4 0 0 0-4-4m-6 4a6 6 0 0 1 12 0v9a6 6 0 0 1-12 0z"
    />
    <Path
      fill={color}
      d="M8 15a1 1 0 0 1 1 1 7 7 0 0 0 14 0 1 1 0 1 1 2 0 9 9 0 0 1-8 8.945V27h3a1 1 0 1 1 0 2h-8a1 1 0 1 1 0-2h3v-2.055A9 9 0 0 1 7 16a1 1 0 0 1 1-1"
    />
  </Svg>
)
