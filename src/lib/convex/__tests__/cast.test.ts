import { describe, expect, test } from 'bun:test'
import { castConvex } from '../cast'

describe('castConvex', () => {
  test('strips _id and _creationTime from a top-level document', () => {
    const result = castConvex<{ id: string; title: string }>({
      _id: 'kn72...',
      _creationTime: 1789644864208.7,
      id: 'checklist_1',
      title: 'VISTORIA',
    })
    expect(result).toEqual({ id: 'checklist_1', title: 'VISTORIA' })
  })

  test('strips system fields from every element of an array of documents', () => {
    // Regression: useEntityList reads api.checklists.list, an array where
    // every element is its own full document (its own _id/_creationTime) —
    // unlike embedded fields such as `items`, which Convex never attaches
    // system fields to, since they aren't separate table rows.
    const result = castConvex<Array<{ id: string }>>([
      { _id: 'a', _creationTime: 1, id: 'checklist_1' },
      { _id: 'b', _creationTime: 2, id: 'checklist_2' },
    ])
    expect(result).toEqual([{ id: 'checklist_1' }, { id: 'checklist_2' }])
  })

  test('leaves embedded array fields untouched — they carry no system fields of their own', () => {
    const result = castConvex<{ items: Array<{ id: string; note: string }> }>({
      _id: 'kn72...',
      _creationTime: 123,
      items: [{ id: 'item_1', note: 'ok' }],
    })
    expect(result).toEqual({ items: [{ id: 'item_1', note: 'ok' }] })
  })

  test('passes null through unchanged', () => {
    expect(castConvex<null>(null)).toBeNull()
  })

  test('leaves an object with no system fields unchanged', () => {
    const value = { title: 'plain' }
    expect(castConvex<typeof value>(value)).toEqual(value)
  })
})
