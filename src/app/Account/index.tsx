import { Text, View } from 'react-native'
import { Screen } from '@/components'
import { Icon } from '@/components/Icon'
import { colors } from '@/styles'
import { styles } from './styles'

export function Account() {
  return (
    <Screen variant="top" title="Conta" subtitle="Perfil e preferências">
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Icon name="user" size={22} color={colors.blue.base} />
        </View>
        <Text style={styles.title}>Em breve</Text>
        <Text style={styles.text}>
          Perfil, preferências e encerramento de sessão ainda não estão
          disponíveis nesta versão. A responsabilidade por cada vistoria é
          controlada por tags, não por login.
        </Text>
      </View>
    </Screen>
  )
}
