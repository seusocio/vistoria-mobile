import { describe, expect, test } from 'bun:test'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import type { Application, ApplicationItem } from '../application.types'
import { buildAdHocItem, buildApplication, buildRepeatedApplication } from '../application.builders'

const checklist = {
  id: 'cl_1',
  title: 'Torre A',
  tagsIds: [],
  options: [],
  source: 'manual',
  items: [
    { id: 'ci_1', position: 0, title: 'Cozinha: Piso', description: 'Sem trincas', tagsIds: ['t_piso'], deletedAt: null },
    { id: 'ci_2', position: 1, title: 'Cozinha: Pia', description: '', tagsIds: [], deletedAt: null },
    { id: 'ci_old', position: 2, title: 'Removido', description: '', tagsIds: [], deletedAt: '2026-09-01T00:00:00.000Z' },
  ],
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
} as unknown as Checklist

describe('starting a new visit ("nova aplicação")', () => {
  test('creates a draft with one blank item per live checklist item', () => {
    const app = buildApplication({ checklistId: 'cl_1', tagsIds: ['t_bloco'], date: '2026-10-15' }, checklist)
    expect(app.status).toBe('draft')
    expect(app.tagsIds).toEqual(['t_bloco'])
    expect(app.items.map((i) => i.checklistItemId)).toEqual(['ci_1', 'ci_2'])
    expect(app.items[0]).toMatchObject({ title: 'Cozinha: Piso', description: 'Sem trincas', answer: '', tagsIds: ['t_piso'] })
  })
})

describe('repeating the last visit ("repetir")', () => {
  function previous(items: Partial<ApplicationItem>[]): Application {
    const base = buildApplication({ checklistId: 'cl_1', tagsIds: ['t_bloco'], date: '2026-10-01' }, checklist)
    return {
      ...base,
      id: 'app_prev',
      attachments: [{ id: 'att_1' } as Application['attachments'][number]],
      items: items.map((overrides, index) => ({ ...base.items[0], id: `prev_${index}`, ...overrides }) as ApplicationItem),
    }
  }

  test('carries answers over as suggestions, never as confirmed answers', () => {
    const source = previous([
      { checklistItemId: 'ci_1', position: 0, answer: 'Não', note: 'trinca', quantity: 2, workflowStatus: 'denied' },
      { checklistItemId: 'ci_2', position: 1, answer: '' },
    ])
    const next = buildRepeatedApplication(source, checklist)
    const [piso, pia] = next.items
    expect(piso).toMatchObject({
      answer: 'Não',
      note: 'trinca',
      quantity: 2,
      suggested: true,
      suggestionSource: 'previous_application',
    })
    expect(piso.workflowStatus).toBeNull()
    expect(pia).toMatchObject({ answer: '', suggested: false })
  })

  test('keeps the tag set, references the source gallery and starts with no photos', () => {
    const next = buildRepeatedApplication(previous([]), checklist)
    expect(next.id).not.toBe('app_prev')
    expect(next.tagsIds).toEqual(['t_bloco'])
    expect(next.gallerySourceApplicationId).toBe('app_prev')
    expect(next.attachments).toEqual([])
  })

  test('brings ad-hoc items along, with a fresh id and no workflow status', () => {
    const source = previous([{ checklistItemId: null, position: 9, title: 'Item avulso', answer: 'Sim', workflowStatus: 'in_review' }])
    const extra = buildRepeatedApplication(source, checklist).items.find((i) => i.title === 'Item avulso')
    expect(extra).toBeDefined()
    expect(extra?.id).not.toBe('prev_0')
    expect(extra).toMatchObject({ suggested: true, suggestionSource: 'previous_application', workflowStatus: null, attachments: [] })
  })
})

describe('adding an item on the fill screen ("adicionar item")', () => {
  test('is a blank, unanswered item outside the template', () => {
    const added = buildAdHocItem({ title: 'Rodapé', tagsIds: ['t_1'] }, 7)
    expect(added).toMatchObject({
      position: 7,
      checklistItemId: null,
      title: 'Rodapé',
      answer: '',
      tagsIds: ['t_1'],
      attachments: [],
      workflowStatus: null,
      deletedAt: null,
    })
    expect(added.id.startsWith('aitem_')).toBe(true)
  })
})
