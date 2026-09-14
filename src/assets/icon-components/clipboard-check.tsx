import Svg, { Path, SvgProps } from 'react-native-svg'

export const ClipboardCheck = ({
  width = 24,
  height = 24,
  color = '#000',
  ...props
}: SvgProps) => (
  <Svg width={width} height={height} viewBox="0 0 32 32" fill="none" {...props}>
    <Path
      fill={color}
      d="M12 3a1 1 0 0 0-1 1v1H8a3 3 0 0 0-3 3v18a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3h-3V4a1 1 0 0 0-1-1zm9 4v1a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V7H8a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z"
    />
    <Path
      fill={color}
      d="M21.707 15.293a1 1 0 0 1 0 1.414l-6 6a1 1 0 0 1-1.414 0l-3-3a1 1 0 1 1 1.414-1.414L15 20.586l5.293-5.293a1 1 0 0 1 1.414 0"
    />
  </Svg>
)
