import AsyncStorage from '@react-native-async-storage/async-storage'
import { ConvexApplicationRepository, ConvexChecklistRepository, ConvexTagRepository } from '@/infra/convex'
import { STORAGE_KEYS } from './keys'

export * from './migrate-to-convex'
export * from './async-storage-application-repository'
export * from './async-storage-checklist-repository'
export * from './async-storage-tag-repository'
export * from './keys'
export * from './local-collection'

/**
 * Convex is the source of truth for all shared domain data. The AsyncStorage
 * repositories remain exported for offline migration and isolated tests.
 */
export const tagRepository = new ConvexTagRepository()
export const checklistRepository = new ConvexChecklistRepository()
export const applicationRepository = new ConvexApplicationRepository()

export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.TAGS,
    STORAGE_KEYS.CHECKLISTS,
    STORAGE_KEYS.APPLICATIONS,
    STORAGE_KEYS.SEEDED,
  ])
}
