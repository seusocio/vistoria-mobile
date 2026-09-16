import { ReactNode } from 'react'
import { Text } from 'react-native'
import { styles } from './styles'

export function ItemCardDescription({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.description} numberOfLines={1}>
      {children}
    </Text>
  )
}
