import { ReactNode } from 'react'
import { StyleProp, Text, TextStyle } from 'react-native'
import { styles } from './styles'

export function ItemCardTitle({
  children,
  numberOfLines = 2,
  muted = false,
  style,
}: {
  children: ReactNode
  numberOfLines?: number
  /** Greys out the text, e.g. for an empty-title placeholder. */
  muted?: boolean
  style?: StyleProp<TextStyle>
}) {
  return (
    <Text
      style={[style ?? styles.title, muted && styles.placeholderText]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  )
}
