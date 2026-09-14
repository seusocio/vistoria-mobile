import Svg, { Circle, Path, SvgProps } from 'react-native-svg'

export const Camera = ({
  width = 24,
  height = 24,
  color = '#000',
  ...props
}: SvgProps) => (
  <Svg width={width} height={height} viewBox="0 0 32 32" fill="none" {...props}>
    <Path
      fill={color}
      d="M12.4 6a3 3 0 0 0-2.496 1.336L8.766 9H6a4 4 0 0 0-4 4v11a4 4 0 0 0 4 4h20a4 4 0 0 0 4-4V13a4 4 0 0 0-4-4h-2.766l-1.138-1.664A3 3 0 0 0 19.6 6zm-.828 2.45A1 1 0 0 1 12.4 8h7.2a1 1 0 0 1 .828.45L21.72 10.6a1 1 0 0 0 .828.45H26a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2h3.452a1 1 0 0 0 .828-.45z"
    />
    <Circle cx={16} cy={18} r={5} fill={color} />
  </Svg>
)
