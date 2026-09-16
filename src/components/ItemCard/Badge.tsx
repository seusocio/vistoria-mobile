import { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { styles } from './styles'

export function ItemCardBadge({ children }: { children: ReactNode }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{children}</Text>
    </View>
  )
}
