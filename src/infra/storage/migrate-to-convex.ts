import AsyncStorage from '@react-native-async-storage/async-storage'
import { Application, Checklist, Tag } from '@/infra/domain/entities'
import { ConvexApplicationRepository, ConvexChecklistRepository, ConvexTagRepository } from '@/infra/convex'
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

  for (const tag of tags) await tagRepository.create(tag)
  for (const checklist of checklists) await checklistRepository.save(checklist)
  for (const application of applications) await applicationRepository.save(application)

  await AsyncStorage.setItem(STORAGE_KEYS.CONVEX_MIGRATED, '1')
}
