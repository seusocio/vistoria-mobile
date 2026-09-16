import { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { colors } from '@/styles'
import { Icon, type IconName } from '../Icon'
import { styles } from './styles'

export function ItemCardMeta({ children }: { children: ReactNode }) {
  return <View style={styles.metaRow}>{children}</View>
}

export function ItemCardMetaItem({
  icon,
  children,
}: {
  icon?: IconName
  children?: ReactNode
}) {
  return (
    <View style={styles.metaItem}>
      {icon ? <Icon name={icon} size={10} color={colors.gray[400]} /> : null}
      {children != null ? <Text style={styles.metaText}>{children}</Text> : null}
    </View>
  )
}
