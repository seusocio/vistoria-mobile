import { ReactNode } from 'react'
import { View } from 'react-native'
import { styles } from './styles'

export function ItemCardActions({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>
}
