import { ReactNode } from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'
import { styles } from './styles'

export function ItemCardContent({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  return <View style={[styles.content, style]}>{children}</View>
}
