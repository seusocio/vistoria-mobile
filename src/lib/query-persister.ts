import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'

/** Android's AsyncStorage silently rejects a value over roughly this size. */
const MAX_PERSISTED_BYTES = 1_000_000
const PERSIST_DEBOUNCE_MS = 500

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: '@vistoria/query-cache',
  throttleTime: PERSIST_DEBOUNCE_MS,
})

/**
 * Carries over `snapshot.store.ts`'s two hard-won constants — the 1 MB cap
 * and the debounced write (`throttleTime` above) — into React Query's own
 * persistence, which now does the job the hand-rolled snapshot store used to.
 */
export const queryPersister: Persister = {
  ...asyncStoragePersister,
  persistClient: async (client: PersistedClient) => {
    if (JSON.stringify(client).length > MAX_PERSISTED_BYTES) return
    await asyncStoragePersister.persistClient(client)
  },
}
