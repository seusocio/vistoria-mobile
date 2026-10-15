import { Text, View } from 'react-native'
import type { OpError } from '@/lib/offline-queue/queue.store'
import { styles } from '../styles'
import { json, time } from '../utils'

export function ErrorBlock({ error }: { error: OpError | string }) {
  if (typeof error === 'string') return <Text style={styles.error}>{error}</Text>
  return (
    <View>
      <Text style={styles.error}>
        {error.status !== undefined ? `${error.status} · ` : ''}
        {error.message} · {time(error.at)}
      </Text>
      {error.body !== undefined && <Text style={styles.code}>{json(error.body)}</Text>}
    </View>
  )
}
