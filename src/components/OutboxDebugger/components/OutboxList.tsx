import { useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { drainOutbox, MAX_ATTEMPTS, useOutbox, type QueuedOp } from '@/lib/offline-queue'
import { styles } from '../styles'
import { attachmentIdOf, json, time } from '../utils'
import { ActionButton } from './ActionButton'
import { ErrorBlock } from './ErrorBlock'

export function OutboxList({ items }: { items: QueuedOp[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  if (items.length === 0) return <Text style={styles.empty}>Outbox vazio.</Text>

  const drop = (item: QueuedOp) =>
    Alert.alert('Descartar op?', `${item.type}\n\nA escrita é perdida — use só para destravar a fila.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: () => {
          useOutbox.getState().resolve(item.id)
          void drainOutbox()
        },
      },
    ])

  return (
    <>
      {items.map((item, index) => {
        const isOpen = expanded === item.id
        const isHead = index === 0
        const attachmentId = attachmentIdOf(item)
        return (
          <Pressable
            key={item.id}
            style={[styles.card, isHead && styles.cardHead, item.status === 'failed' && styles.cardFailed]}
            onPress={() => setExpanded(isOpen ? null : item.id)}
          >
            <View style={styles.row}>
              <Text style={styles.cardTitle}>
                #{index} {item.type}
              </Text>
              <Text style={[styles.badge, item.status === 'failed' ? styles.badgeFailed : styles.badgePending]}>
                {isHead && item.status === 'failed' ? 'BLOCKING' : item.status}
              </Text>
            </View>
            <Text style={styles.meta}>
              {item.kind} · attempts {item.attempts}/{MAX_ATTEMPTS} · {time(item.enqueuedAt)}
            </Text>
            <Text style={styles.meta}>entity {item.entityId}</Text>
            {attachmentId && <Text style={styles.meta}>attachment {attachmentId}</Text>}
            {item.lastError && <ErrorBlock error={item.lastError} />}
            {isOpen && (
              <>
                <Text style={styles.meta}>op {item.id}</Text>
                <Text style={styles.code}>{json(item.args)}</Text>
                <View style={styles.actions}>
                  <ActionButton label="Descartar op" danger onPress={() => drop(item)} />
                </View>
              </>
            )}
          </Pressable>
        )
      })}
    </>
  )
}
