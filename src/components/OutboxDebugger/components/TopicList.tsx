import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import type { QueuedOp } from '@/lib/offline-queue'
import { scopeOfItem } from '@/lib/offline-queue/drain'
import type { DrainEvent } from '@/lib/offline-queue/drain-log'
import type { OpError } from '@/lib/offline-queue/queue.store'
import { styles } from '../styles'
import { age, attachmentIdOf } from '../utils'
import { ErrorBlock } from './ErrorBlock'

interface Topic {
  name: string
  /** Waiting messages, with their offset in the one real FIFO queue. */
  messages: Array<{ item: QueuedOp; offset: number }>
  consumed: Record<DrainEvent['outcome'], number>
  lastError?: OpError
}

function emptyConsumed(): Topic['consumed'] {
  return {
    resolved: 0,
    'resolved-not-found': 0,
    'dropped-best-effort': 0,
    retry: 0,
    failed: 0,
    'unknown-op': 0,
    'cache-error': 0,
    'dropped-scope-gone': 0,
  }
}

/**
 * The outbox seen like Kafka: one topic per op type, one partition per
 * Visita (the drain's `scope`), with what this session consumed from each.
 * Only a view — underneath it is still a single FIFO queue, so a failed head
 * stalls every topic, not just its own.
 */
export function TopicList({ items, events }: { items: QueuedOp[]; events: DrainEvent[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const topics = new Map<string, Topic>()
  const topicFor = (name: string) => {
    let topic = topics.get(name)
    if (!topic) {
      topic = { name, messages: [], consumed: emptyConsumed() }
      topics.set(name, topic)
    }
    return topic
  }
  items.forEach((item, offset) => {
    const topic = topicFor(item.type)
    topic.messages.push({ item, offset })
    if (item.lastError) topic.lastError = item.lastError
  })
  for (const event of events) {
    const topic = topicFor(event.type)
    topic.consumed[event.outcome] += 1
    if (event.error && !topic.lastError) topic.lastError = event.error
  }

  const head = items[0]
  const sorted = [...topics.values()].sort(
    (a, b) => b.messages.length - a.messages.length || a.name.localeCompare(b.name),
  )
  if (sorted.length === 0) return <Text style={styles.empty}>Nenhum tópico: outbox vazio e nada drenado.</Text>

  return (
    <>
      {head?.status === 'failed' && (
        <Text style={styles.error}>
          Fila parada: a cabeça ({head.type}) falhou. Todos os tópicos esperam por ela.
        </Text>
      )}
      {sorted.map((topic) => {
        const isOpen = expanded === topic.name
        const failed = topic.messages.filter(({ item }) => item.status === 'failed').length
        const oldest = topic.messages[0]?.item.enqueuedAt
        const delivered = topic.consumed.resolved + topic.consumed['resolved-not-found']
        const dropped =
          topic.consumed['dropped-best-effort'] + topic.consumed['dropped-scope-gone'] + topic.consumed['unknown-op']
        const partitions = new Map<string, Array<{ item: QueuedOp; offset: number }>>()
        for (const message of topic.messages) {
          const key = scopeOfItem(message.item)
          partitions.set(key, [...(partitions.get(key) ?? []), message])
        }
        return (
          <Pressable
            key={topic.name}
            style={[styles.card, failed > 0 && styles.cardFailed]}
            onPress={() => setExpanded(isOpen ? null : topic.name)}
          >
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{topic.name}</Text>
              <Text style={[styles.badge, failed > 0 ? styles.badgeFailed : styles.badgePending]}>
                {topic.messages.length} lag{failed > 0 ? ` · ${failed} failed` : ''}
              </Text>
            </View>
            <Text style={styles.meta}>
              {partitions.size} partitions · oldest {oldest ? age(oldest) : '—'} · consumed {delivered} · retries{' '}
              {topic.consumed.retry} · dropped {dropped}
            </Text>
            {topic.lastError && <ErrorBlock error={topic.lastError} />}
            {isOpen &&
              [...partitions.entries()].map(([partition, messages]) => (
                <View key={partition} style={styles.partition}>
                  <Text style={styles.meta}>
                    partition {partition} · {messages.length} msgs
                  </Text>
                  {messages.map(({ item, offset }) => (
                    <Text key={item.id} style={[styles.meta, item.status === 'failed' && styles.badgeFailed]}>
                      @{offset} {item.status} · attempts {item.attempts} · {age(item.enqueuedAt)} ago
                      {attachmentIdOf(item) ? ` · ${attachmentIdOf(item)}` : ''}
                    </Text>
                  ))}
                </View>
              ))}
          </Pressable>
        )
      })}
    </>
  )
}
