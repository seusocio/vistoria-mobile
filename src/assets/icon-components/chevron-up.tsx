import Svg, { Path, SvgProps } from 'react-native-svg'

export const ChevronUp = ({
  width = 24,
  height = 24,
  color = '#000',
  ...props
}: SvgProps) => (
  <Svg width={width} height={height} viewBox="0 0 32 32" fill="none" {...props}>
    <Path
      fill={color}
      d="M16 10.222c.967 0 1.896.382 2.586 1.06l.005.006 8.783 8.782.068.076a1 1 0 0 1-1.406 1.407l-.076-.069-8.784-8.782a1.7 1.7 0 0 0-1.176-.48l-.165.008c-.382.038-.741.205-1.017.477l-8.777 8.777-.076.07a1 1 0 0 1-1.408-1.408l.07-.076 8.787-8.787a3.69 3.69 0 0 1 2.405-1.056z"
    />
  </Svg>
)
