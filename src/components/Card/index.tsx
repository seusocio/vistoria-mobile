import { Text, View, ViewProps } from 'react-native'
import { colors } from '@/styles'
import { Icon, IconName } from '../Icon'
import { styles } from './styles'

interface CardProps extends ViewProps {
  icon: IconName
  title: string
  children: React.ReactNode
}

export function Card({ icon, title, children, style, ...props }: CardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Icon name={icon} size={16} color={colors.blue.base} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={style} {...props}>
        {children}
      </View>
    </View>
  )
}
