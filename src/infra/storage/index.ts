import AsyncStorage from '@react-native-async-storage/async-storage'
import { AsyncStorageApplicationRepository } from './async-storage-application-repository'
import { AsyncStorageChecklistRepository } from './async-storage-checklist-repository'
import { AsyncStorageTagRepository } from './async-storage-tag-repository'
import { STORAGE_KEYS } from './keys'

export * from './async-storage-application-repository'
export * from './async-storage-checklist-repository'
export * from './async-storage-tag-repository'
export * from './keys'
export * from './local-collection'

/**
 * Single instance of each repository, backed by AsyncStorage.
 * Swapping to a real backend later means writing new classes that
 * implement the same domain/repositories interfaces and wiring them
 * here instead - services and screens stay untouched.
 */
export const tagRepository = new AsyncStorageTagRepository()
export const checklistRepository = new AsyncStorageChecklistRepository()
export const applicationRepository = new AsyncStorageApplicationRepository()

export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.TAGS,
    STORAGE_KEYS.CHECKLISTS,
    STORAGE_KEYS.APPLICATIONS,
    STORAGE_KEYS.SEEDED,
  ])
}
