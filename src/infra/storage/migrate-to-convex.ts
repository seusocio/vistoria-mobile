import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ConvexApplicationRepository,
  ConvexChecklistRepository,
  ConvexTagRepository,
} from '@/infra/convex'
import { Application, Checklist, Tag } from '@/infra/domain/entities'
import { STORAGE_KEYS } from './keys'
import { readCollection } from './local-collection'

const tagRepository = new ConvexTagRepository()
const checklistRepository = new ConvexChecklistRepository()
const applicationRepository = new ConvexApplicationRepository()

export async function migrateLocalDataToConvex(): Promise<void> {
  if (await AsyncStorage.getItem(STORAGE_KEYS.CONVEX_MIGRATED)) return

  const [tags, checklists, applications] = await Promise.all([
    readCollection<Tag>(STORAGE_KEYS.TAGS),
    readCollection<Checklist>(STORAGE_KEYS.CHECKLISTS),
    readCollection<Application>(STORAGE_KEYS.APPLICATIONS),
  ])

  await Promise.all(tags.map((tag) => tagRepository.create(tag)))
  await Promise.all(
    checklists.map((checklist) => checklistRepository.save(checklist)),
  )
  await Promise.all(
    applications.map((application) => applicationRepository.save(application)),
  )

  await AsyncStorage.setItem(STORAGE_KEYS.CONVEX_MIGRATED, '1')
}
