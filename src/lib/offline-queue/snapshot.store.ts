import AsyncStorage from '@react-native-async-storage/async-storage'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { create } from 'zustand'

const PREFIX = '@vistoria/snapshot/'
const WRITE_DEBOUNCE_MS = 500
/**
 * Android's AsyncStorage backing store rejects very large values, and a
 * rejected write is silent. Skipping the write keeps the last good snapshot
 * instead of leaving a half-written one.
 */
const MAX_SNAPSHOT_BYTES = 1_000_000

interface SnapshotState {
  byKey: Record<string, unknown>
  /** False until the on-disk snapshots have been read; screens must wait for it. */
  hydrated: boolean
}

export const useSnapshots = create<SnapshotState>(() => ({
  byKey: {},
  hydrated: false,
}))

/**
 * Stable identity for a query + args pair. Args are serialised with sorted
 * keys so `{ id, checklistId }` and `{ checklistId, id }` are the same key.
 */
export function snapshotKey(
  query: FunctionReference<'query'>,
  args: Record<string, unknown>,
): string {
  const entries = Object.entries(args).sort(([a], [b]) => a.localeCompare(b))
  return `${getFunctionName(query)}(${JSON.stringify(entries)})`
}

const writeTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Remembers the server's last answer for a query, in memory and on disk.
 *
 * This is what makes the app readable with no network at all. Convex keeps
 * query results in the client's memory only: after a process kill there is
 * nothing to read, `useQuery` stays `undefined` forever with no socket, and
 * every screen sits on a spinner. The outbox alone can't cover this — it
 * holds pending *writes*, not the entities a user loaded while online.
 */
export function writeSnapshot(key: string, value: unknown): void {
  if (useSnapshots.getState().byKey[key] === value) return
  useSnapshots.setState((state) => ({ byKey: { ...state.byKey, [key]: value } }))

  clearTimeout(writeTimers.get(key))
  writeTimers.set(
    key,
    setTimeout(() => {
      writeTimers.delete(key)
      let serialised: string
      try {
        serialised = JSON.stringify(value)
      } catch {
        return
      }
      if (serialised.length > MAX_SNAPSHOT_BYTES) return
      void AsyncStorage.setItem(`${PREFIX}${key}`, serialised).catch(() => undefined)
    }, WRITE_DEBOUNCE_MS),
  )
}

/**
 * Reads every persisted snapshot into memory. Call once at boot, before the
 * first screen renders a decision about whether it has data.
 */
export async function hydrateSnapshots(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX))
    if (keys.length > 0) {
      const entries = await AsyncStorage.multiGet(keys)
      const byKey: Record<string, unknown> = {}
      for (const [storageKey, raw] of entries) {
        if (!raw) continue
        try {
          byKey[storageKey.slice(PREFIX.length)] = JSON.parse(raw)
        } catch {
          // A corrupt entry is just a cache miss.
        }
      }
      useSnapshots.setState((state) => ({ byKey: { ...byKey, ...state.byKey } }))
    }
  } catch {
    // No cache is a valid state — the screens fall back to "loading".
  } finally {
    useSnapshots.setState({ hydrated: true })
  }
}
