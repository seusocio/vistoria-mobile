import type { Query } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Share, Text, View } from 'react-native'
import { drainOutbox, retryFailedOps, useIsOnline, useOutbox } from '@/lib/offline-queue'
import { useDrainLog } from '@/lib/offline-queue/drain-log'
import { queryClient } from '@/lib/query-client'
import { getUploadWorkerDebug, useUploadStore } from '@/lib/uploads/upload-store'
import { styles } from '../styles'
import { querySummary } from '../utils'
import { ActionButton } from './ActionButton'
import { DrainLogList } from './DrainLogList'
import { OutboxList } from './OutboxList'
import { QueryList } from './QueryList'
import { TopicList } from './TopicList'
import { UploadList } from './UploadList'

type Tab = 'topics' | 'outbox' | 'uploads' | 'queries' | 'log'

/** Re-renders on every query-cache event — fine for a debug screen, too chatty for anything else. */
function useQueryCacheSnapshot(): Query[] {
  const cache = queryClient.getQueryCache()
  const [, setVersion] = useState(0)
  useEffect(() => cache.subscribe(() => setVersion((version) => version + 1)), [cache])
  return cache.getAll()
}

export function DebuggerSheet({ onClose }: { onClose: () => void }) {
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
        <ActionButton label="Resume uploads" onPress={uploadState.resumePending} />
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
