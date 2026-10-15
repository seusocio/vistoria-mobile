import { describe, expect, test } from 'bun:test'
import type { Application, ApplicationItem } from '../application.types'
import {
  fromApplicationResponse,
  toCreateApplicationBody,
  toUpdateApplicationBody,
  toUpdateItemBody,
} from '../application.mappers'

const item: ApplicationItem = {
  id: 'aitem_1',
  position: 0,
  checklistItemId: 'ci_1',
  parentId: null,
  title: 'Cozinha: Piso',
  description: '',
  answer: 'Sim',
  answeredAt: '2026-10-02T00:00:00.000Z',
  note: '',
  quantity: null,
  attachments: [],
  tagsIds: ['t_1'],
  suggested: false,
  suggestionSource: null,
  workflowStatus: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  deletedAt: null,
}

describe('creating a visit on the server', () => {
  test('sends the visit with its items, and no attachments or timestamps', () => {
    const app: Application = {
      id: 'application_1',
      checklistId: 'cl_1',
      tagsIds: ['t_bloco'],
      date: '2026-10-01',
      status: 'draft',
      items: [item],
      attachments: [],
      gallerySourceApplicationId: 'application_0',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      completedAt: null,
      deletedAt: null,
    }
    expect(toCreateApplicationBody(app)).toEqual({
      id: 'application_1',
      checklistId: 'cl_1',
      tagsIds: ['t_bloco'],
      date: '2026-10-01',
      status: 'draft',
      gallerySourceApplicationId: 'application_0',
      items: [
        {
          id: 'aitem_1',
          checklistItemId: 'ci_1',
          parentId: null,
          position: 0,
          title: 'Cozinha: Piso',
          description: '',
          tagsIds: ['t_1'],
          answer: 'Sim',
          answeredAt: '2026-10-02T00:00:00.000Z',
          note: '',
          quantity: null,
          suggested: false,
          suggestionSource: null,
          workflowStatus: null,
        },
      ],
    })
  })
})

describe('patch bodies', () => {
  test('only send the fields that changed', () => {
    expect(toUpdateApplicationBody({ applicationId: 'a', checklistId: 'c', status: 'completed', updatedAt: 'now' })).toEqual({
      updatedAt: 'now',
      status: 'completed',
    })
    expect(toUpdateItemBody({ itemId: 'i', answer: '', workflowStatus: null, updatedAt: 'now' })).toEqual({
      updatedAt: 'now',
      answer: '',
      workflowStatus: null,
    })
  })
})

describe('reading a visit', () => {
  test('fills defaults and treats an unknown upload status as uploaded', () => {
    const app = fromApplicationResponse({
      id: 'application_1',
      checklistId: 'cl_1',
      date: '2026-10-01',
      status: 'draft',
      createdAt: 'c',
      updatedAt: 'u',
      attachmentsCount: 1,
      attachments: [{ id: 'att_1', name: 'a.jpg', position: 0, createdAt: 'c', uploadStatus: 'weird', storageKey: 'k' }],
      items: [{ id: 'aitem_1', position: 0, title: 'X', createdAt: 'c', updatedAt: 'u' }],
    })
    expect(app).toMatchObject({ tagsIds: [], gallerySourceApplicationId: null, completedAt: null, attachmentsCount: 1 })
    expect(app.attachments[0]).toMatchObject({ uploadStatus: 'uploaded', storageId: 'k', url: undefined })
    expect(app.items[0]).toMatchObject({ answer: '', note: '', quantity: null, tagsIds: [], attachments: [], workflowStatus: null })
  })
})
