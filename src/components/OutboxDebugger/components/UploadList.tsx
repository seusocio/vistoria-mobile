import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useOutbox } from '@/lib/offline-queue'
import { getUploadWorkerDebug, type UploadJob, useUploadStore } from '@/lib/uploads/upload-store'
import { styles } from '../styles'
import { attachmentIdOf, json } from '../utils'
import { ActionButton } from './ActionButton'
import { ErrorBlock } from './ErrorBlock'

export function UploadList() {
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
