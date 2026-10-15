import type { Query } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import {
  drainOutbox,
  MAX_ATTEMPTS,
  retryFailedOps,
  useIsOnline,
  useOutbox,
  type QueuedOp,
} from '@/lib/offline-queue'
import { scopeOfItem } from '@/lib/offline-queue/drain'
import { type DrainEvent, useDrainLog } from '@/lib/offline-queue/drain-log'
import type { OpError } from '@/lib/offline-queue/queue.store'
import { queryClient } from '@/lib/query-client'
import { getUploadWorkerDebug, type UploadJob, useUploadStore } from '@/lib/uploads/upload-store'
import { colors } from '@/styles'
import { styles } from './styles'

type Tab = 'topics' | 'outbox' | 'uploads' | 'queries' | 'log'

const MAX_JSON = 4000

function json(value: unknown): string {
  let text: string
  try {
    text = JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    text = String(value)
  }
  return text.length > MAX_JSON ? `${text.slice(0, MAX_JSON)}\n… (${text.length - MAX_JSON} more chars)` : text
}

function time(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString('pt-BR')
}

function keyLabel(query: Query): string {
  return JSON.stringify(query.queryKey)
}

/** A one-line size hint for cached data: rows in a list, rows across an infinite list's pages. */
function dataShape(data: unknown): string {
  if (data === undefined) return 'no data'
  if (Array.isArray(data)) return `${data.length} rows`
  if (data && typeof data === 'object') {
    const pages = (data as { pages?: Array<{ items?: unknown[] }> }).pages
    if (Array.isArray(pages)) return `${pages.length} pages, ${pages.reduce((n, page) => n + (page.items?.length ?? 0), 0)} rows`
    const rows = (data as { data?: unknown }).data
    if (Array.isArray(rows)) return `${rows.length} rows`
    return 'object'
  }
  return typeof data
}

/** Re-renders on every query-cache event — fine for a debug screen, too chatty for anything else. */
function useQueryCacheSnapshot(): Query[] {
  const cache = queryClient.getQueryCache()
  const [, setVersion] = useState(0)
  useEffect(() => cache.subscribe(() => setVersion((version) => version + 1)), [cache])
  return cache.getAll()
}

function querySummary(query: Query) {
  return {
    key: query.queryKey,
    status: query.state.status,
    fetchStatus: query.state.fetchStatus,
    stale: query.isStale(),
    observers: query.getObserversCount(),
    updatedAt: query.state.dataUpdatedAt ? new Date(query.state.dataUpdatedAt).toISOString() : null,
    data: dataShape(query.state.data),
    error: query.state.error instanceof Error ? query.state.error.message : (query.state.error ?? null),
  }
}

function attachmentIdOf(item: QueuedOp): string | undefined {
  const args = item.args as { attachmentId?: string; attachment?: { id?: string } } | null
  return args?.attachmentId ?? args?.attachment?.id
}

/**
 * On-device view into the offline write path: the outbox (with each op's
 * args and last error), the upload queue (with the session flags that decide
 * whether a job runs), the React Query cache the overlay reads from, and
 * what the drain did recently. Opened from the pill
 * under the sync bar; behind `FEATURE_FLAG.outboxDebugger`.
 */
export function OutboxDebugger() {
  const [open, setOpen] = useState(false)
  const { top } = useSafeAreaInsets()
  const items = useOutbox((state) => state.items)
  const uploads = useUploadStore((state) => state.queue.length)

  if (!FEATURE_FLAG.outboxDebugger) return null

  const failed = items.some((item) => item.status === 'failed')
  const pillColor = failed ? colors.danger.base : items.length > 0 || uploads > 0 ? colors.blue.base : colors.gray[400]

  return (
    <>
      <Pressable
        style={[styles.pill, { top: top + 6, backgroundColor: pillColor }]}
        onPress={() => setOpen(true)}
        hitSlop={12}
      >
        <Text style={styles.pillText}>
          {failed ? '⚠ ' : ''}
          {items.length} ops · {uploads} up
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <DebuggerSheet onClose={() => setOpen(false)} />
      </Modal>
    </>
  )
}

function DebuggerSheet({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('topics')
  const isOnline = useIsOnline()
  const items = useOutbox((state) => state.items)
  const uploadState = useUploadStore()
  const events = useDrainLog((state) => state.events)
  const queries = useQueryCacheSnapshot()
  const mutating = queryClient.isMutating()

  const share = () => {
    const dump = {
      at: new Date().toISOString(),
      isOnline,
      outbox: items,
      uploads: {
        queue: uploadState.queue,
        inFlight: uploadState.inFlight,
        blocked: uploadState.blocked,
        abandoned: uploadState.abandoned,
        progress: uploadState.progress,
        errors: uploadState.errors,
        worker: getUploadWorkerDebug(),
      },
      drainLog: events,
      queries: queries.map(querySummary),
    }
    void Share.share({ message: JSON.stringify(dump, null, 2) })
  }

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <Text style={styles.title}>Outbox debugger</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.link}>Fechar</Text>
        </Pressable>
      </View>

      <Text style={styles.summary}>
        {isOnline ? 'online' : 'OFFLINE'} · outbox {items.length} ({items.filter((i) => i.status === 'failed').length}{' '}
        failed) · uploads {uploadState.queue.length} ({Object.keys(uploadState.inFlight).length} in flight,{' '}
        {Object.keys(uploadState.blocked).length} blocked) · queries {queries.length} (
        {queries.filter((query) => query.state.fetchStatus === 'fetching').length} fetching,{' '}
        {queries.filter((query) => query.state.status === 'error').length} error) · mutating {mutating}
      </Text>

      <View style={styles.actions}>
        <ActionButton label="Retry + drain" onPress={() => void retryFailedOps()} />
        <ActionButton label="Drain" onPress={() => void drainOutbox()} />
        <ActionButton label="Resume uploads" onPress={() => void uploadState.resumePending()} />
        <ActionButton label="Share JSON" onPress={share} />
      </View>

      <View style={styles.tabs}>
        {(['topics', 'outbox', 'uploads', 'queries', 'log'] as const).map((value) => (
          <Pressable key={value} style={[styles.tab, tab === value && styles.tabActive]} onPress={() => setTab(value)}>
            <Text style={[styles.tabText, tab === value && styles.tabTextActive]}>
              {value === 'topics'
                ? `Topics (${new Set(items.map((item) => item.type)).size})`
                : value === 'outbox'
                ? `Outbox (${items.length})`
                : value === 'uploads'
                  ? `Uploads (${uploadState.queue.length})`
                  : value === 'queries'
                    ? `Queries (${queries.length})`
                    : `Log (${events.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {tab === 'topics' && <TopicList items={items} events={events} />}
        {tab === 'outbox' && <OutboxList items={items} />}
        {tab === 'uploads' && <UploadList />}
        {tab === 'queries' && <QueryList queries={queries} />}
        {tab === 'log' && <DrainLogList events={events} />}
      </ScrollView>
    </View>
  )
}

function ActionButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [styles.button, danger && styles.buttonDanger, pressed && { opacity: 0.6 }]} onPress={onPress}>
      <Text style={[styles.buttonText, danger && styles.buttonTextDanger]}>{label}</Text>
    </Pressable>
  )
}

function ErrorBlock({ error }: { error: OpError | string }) {
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

function OutboxList({ items }: { items: QueuedOp[] }) {
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
              {item.kind} · {item.backend ?? 'convex'} · attempts {item.attempts}/{MAX_ATTEMPTS} · {time(item.enqueuedAt)}
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

function age(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

/**
 * The outbox seen like Kafka: one topic per op type, one partition per
 * Visita (the drain's `scope`), with what this session consumed from each.
 * Only a view — underneath it is still a single FIFO queue, so a failed head
 * stalls every topic, not just its own.
 */
function TopicList({ items, events }: { items: QueuedOp[]; events: DrainEvent[] }) {
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

function UploadList() {
  const state = useUploadStore()
  const items = useOutbox((outbox) => outbox.items)
  const [expanded, setExpanded] = useState<string | null>(null)
  const worker = getUploadWorkerDebug()

  const pendingOpsFor = (attachmentId: string) =>
    items.filter((item) => attachmentIdOf(item) === attachmentId).map((item) => item.type.replace('applications.', ''))

  const abandonedOnly = Object.keys(state.abandoned).filter(
    (id) => !state.queue.some((job) => job.attachment.id === id),
  )

  return (
    <>
      <Text style={styles.meta}>
        workers {worker.activeWorkers} · recovery {worker.recoveryStarted ? 'on' : 'off'} · healed [
        {worker.healedRows.join(', ')}] · marked failed [{worker.markedFailed.join(', ')}]
      </Text>
      {abandonedOnly.length > 0 && <Text style={styles.meta}>abandoned (not queued): {abandonedOnly.join(', ')}</Text>}
      {state.queue.length === 0 && <Text style={styles.empty}>Nenhum upload na fila.</Text>}
      {state.queue.map((job: UploadJob) => {
        const id = job.attachment.id
        const flags = [
          state.inFlight[id] && 'in flight',
          state.blocked[id] && 'blocked',
          state.abandoned[id] && 'abandoned',
          state.progress[id] !== undefined && `${Math.round((state.progress[id] ?? 0) * 100)}%`,
        ].filter(Boolean)
        const ops = pendingOpsFor(id)
        const isOpen = expanded === id
        return (
          <Pressable
            key={id}
            style={[styles.card, state.blocked[id] && styles.cardFailed]}
            onPress={() => setExpanded(isOpen ? null : id)}
          >
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{id}</Text>
              <Text style={[styles.badge, state.blocked[id] ? styles.badgeFailed : styles.badgePending]}>
                {flags.length > 0 ? flags.join(' · ') : 'queued'}
              </Text>
            </View>
            <Text style={styles.meta}>
              app {job.applicationId} · item {job.itemId ?? '—'} · {job.attachment.mimeType ?? '?'}
            </Text>
            <Text style={styles.meta}>
              ops in outbox: {ops.length > 0 ? ops.join(', ') : 'none (row should exist on server)'}
            </Text>
            {state.errors[id] && <ErrorBlock error={state.errors[id]} />}
            {isOpen && (
              <>
                <Text style={styles.code}>{json(job.attachment)}</Text>
                <View style={styles.actions}>
                  <ActionButton label="Cancelar upload" danger onPress={() => state.cancel(id)} />
                </View>
              </>
            )}
          </Pressable>
        )
      })}
    </>
  )
}

function QueryList({ queries }: { queries: Query[] }) {
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const needle = filter.trim().toLowerCase()
  const shown = queries
    .filter((query) => !needle || keyLabel(query).toLowerCase().includes(needle))
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)

  return (
    <>
      <TextInput
        style={styles.filter}
        placeholder="Filtrar por key (ex.: notes, application_f54b)"
        placeholderTextColor={colors.gray[400]}
        value={filter}
        onChangeText={setFilter}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.actions}>
        <ActionButton label="Invalidate all" onPress={() => void queryClient.invalidateQueries()} />
      </View>
      {shown.length === 0 && <Text style={styles.empty}>Nenhuma query no cache.</Text>}
      {shown.map((query) => {
        const summary = querySummary(query)
        const isOpen = expanded === query.queryHash
        const failed = summary.status === 'error'
        return (
          <Pressable
            key={query.queryHash}
            style={[styles.card, failed && styles.cardFailed]}
            onPress={() => setExpanded(isOpen ? null : query.queryHash)}
          >
            <Text style={styles.cardTitle}>{keyLabel(query)}</Text>
            <Text style={[styles.badge, failed ? styles.badgeFailed : styles.badgePending]}>
              {summary.status} · {summary.fetchStatus}
              {summary.stale ? ' · stale' : ''}
            </Text>
            <Text style={styles.meta}>
              {summary.data} · {summary.observers} observers · updated{' '}
              {summary.updatedAt ? time(summary.updatedAt) : 'never'}
            </Text>
            {summary.error !== null && <ErrorBlock error={String(summary.error)} />}
            {isOpen && (
              <>
                <Text style={styles.code}>{json(query.state.data)}</Text>
                <View style={styles.actions}>
                  <ActionButton label="Refetch" onPress={() => void queryClient.refetchQueries({ queryKey: query.queryKey, exact: true })} />
                  <ActionButton label="Invalidate" onPress={() => void queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true })} />
                  <ActionButton label="Remove" danger onPress={() => queryClient.removeQueries({ queryKey: query.queryKey, exact: true })} />
                </View>
              </>
            )}
          </Pressable>
        )
      })}
    </>
  )
}

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

function DrainLogList({ events }: { events: DrainEvent[] }) {
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
