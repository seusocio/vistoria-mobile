import { Text, View } from 'react-native'
import { type DrainEvent, useDrainLog } from '@/lib/offline-queue/drain-log'
import { colors } from '@/styles'
import { styles } from '../styles'
import { time } from '../utils'
import { ActionButton } from './ActionButton'
import { ErrorBlock } from './ErrorBlock'

const OUTCOME_COLOR: Record<DrainEvent['outcome'], string> = {
  resolved: colors.success.base,
  'resolved-not-found': colors.warning.base,
  'dropped-best-effort': colors.warning.base,
  retry: colors.warning.base,
  failed: colors.danger.base,
  'unknown-op': colors.danger.base,
  'cache-error': colors.danger.base,
  'dropped-scope-gone': colors.warning.base,
}

export function DrainLogList({ events }: { events: DrainEvent[] }) {
  if (events.length === 0) return <Text style={styles.empty}>Nada drenado nesta sessão.</Text>
  return (
    <>
      <View style={styles.actions}>
        <ActionButton label="Limpar log" onPress={() => useDrainLog.getState().clear()} />
      </View>
      {events.map((event, index) => (
        <View key={`${event.opId}-${event.at}-${index}`} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.cardTitle}>{event.type}</Text>
            <Text style={[styles.badge, { color: OUTCOME_COLOR[event.outcome] }]}>{event.outcome}</Text>
          </View>
          <Text style={styles.meta}>
            {time(event.at)} · {event.opId}
          </Text>
          {event.error && <ErrorBlock error={event.error} />}
        </View>
      ))}
    </>
  )
}
