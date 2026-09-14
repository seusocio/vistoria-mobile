import AsyncStorage from '@react-native-async-storage/async-storage'
import { STORAGE_KEYS } from '@/infra/storage'
import {
  completeApplication,
  createApplication,
  createChecklist,
  findOrCreateTagByLabel,
  updateApplicationItem,
} from '@/infra/services'
import { checklistTemplates } from './templates'

async function tagsFor(labels: string[]): Promise<string[]> {
  const tags = await Promise.all(
    labels.map((label) => findOrCreateTagByLabel(label)),
  )
  return tags.map((tag) => tag.id)
}

async function answerItems(
  applicationId: string,
  application: Awaited<ReturnType<typeof createApplication>>,
  answers: Array<{ index: number; answer: string; note?: string }>,
) {
  let current = application
  for (const { index, answer, note } of answers) {
    const item = current.items[index]
    if (!item) continue
    current = await updateApplicationItem(current, item.id, {
      answer,
      note: note ?? '',
    })
  }
  return current
}

/**
 * Populates a believable first-run demo: a few templates turned into real
 * checklists, and applications across different tag combinations so the
 * library, history accordion (RF-07.1) and tag report (RF-15) all have
 * something to show. Runs once - guarded by STORAGE_KEYS.SEEDED.
 */
export async function seedDemoDataIfNeeded(): Promise<void> {
  const alreadySeeded = await AsyncStorage.getItem(STORAGE_KEYS.SEEDED)
  if (alreadySeeded) return

  const [torreA, torreB, apto101, apto204, apto302, empreiteira] =
    await Promise.all([
      findOrCreateTagByLabel('Torre A'),
      findOrCreateTagByLabel('Torre B'),
      findOrCreateTagByLabel('Apto 101'),
      findOrCreateTagByLabel('Apto 204'),
      findOrCreateTagByLabel('Apto 302'),
      findOrCreateTagByLabel('Empreiteira Silva & Cia'),
    ])

  const entregaTemplate = checklistTemplates[0]
  const entregaTagsIds = await tagsFor(entregaTemplate.tagLabels)
  const entregaChecklist = await createChecklist({
    title: entregaTemplate.title,
    tagsIds: entregaTagsIds,
    options: entregaTemplate.options,
    items: entregaTemplate.itemTitles.map((title) => ({ title })),
  })

  const areasTemplate = checklistTemplates[1]
  const areasTagsIds = await tagsFor(areasTemplate.tagLabels)
  await createChecklist({
    title: areasTemplate.title,
    tagsIds: areasTagsIds,
    options: areasTemplate.options,
    items: areasTemplate.itemTitles.map((title) => ({ title })),
  })

  const hidraulicaTemplate = checklistTemplates[2]
  const hidraulicaTagsIds = await tagsFor(hidraulicaTemplate.tagLabels)
  await createChecklist({
    title: hidraulicaTemplate.title,
    tagsIds: hidraulicaTagsIds,
    options: hidraulicaTemplate.options,
    items: hidraulicaTemplate.itemTitles.map((title) => ({ title })),
  })

  const daysAgo = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // Older, completed visit to Torre A / Apto 101 - with a couple of negatives.
  let oldEntregaApp = await createApplication(
    {
      checklistId: entregaChecklist.id,
      tagsIds: [torreA.id, apto101.id],
      date: daysAgo(18),
    },
    entregaChecklist,
  )
  oldEntregaApp = await answerItems(oldEntregaApp.id, oldEntregaApp, [
    { index: 0, answer: 'Sim' },
    {
      index: 1,
      answer: 'Não',
      note: 'Pintura da sala com falha próxima à janela.',
    },
    { index: 2, answer: 'Não', note: 'Esquadria do quarto empenada.' },
    { index: 3, answer: 'Sim' },
    { index: 4, answer: 'Sim' },
    { index: 5, answer: 'Parcial' },
    { index: 6, answer: 'Sim' },
  ])
  await completeApplication(oldEntregaApp)

  // Newer, in-progress revisit to the same unit (same tag set -> grouped).
  const recentEntregaApp = await createApplication(
    {
      checklistId: entregaChecklist.id,
      tagsIds: [torreA.id, apto101.id],
      date: daysAgo(1),
    },
    entregaChecklist,
  )
  await answerItems(recentEntregaApp.id, recentEntregaApp, [
    { index: 0, answer: 'Sim' },
    { index: 1, answer: 'Sim' },
  ])

  // A different unit, freshly started, tagging a responsible contractor too.
  const draftAppTorreB = await createApplication(
    {
      checklistId: entregaChecklist.id,
      tagsIds: [torreB.id, apto204.id, empreiteira.id],
      date: daysAgo(5),
    },
    entregaChecklist,
  )
  await answerItems(draftAppTorreB.id, draftAppTorreB, [
    { index: 0, answer: 'Sim' },
    { index: 1, answer: 'Sim' },
    { index: 2, answer: 'Parcial' },
  ])

  // A completed visit to a third unit.
  let completedAppTorreB = await createApplication(
    {
      checklistId: entregaChecklist.id,
      tagsIds: [torreB.id, apto302.id],
      date: daysAgo(10),
    },
    entregaChecklist,
  )
  completedAppTorreB = await answerItems(
    completedAppTorreB.id,
    completedAppTorreB,
    entregaTemplate.itemTitles.map((_, index) => ({ index, answer: 'Sim' })),
  )
  await completeApplication(completedAppTorreB)

  await AsyncStorage.setItem(STORAGE_KEYS.SEEDED, '1')
}
