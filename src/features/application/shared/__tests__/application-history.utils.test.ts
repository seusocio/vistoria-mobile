import { describe, expect, test } from 'bun:test'
import type { Application } from '../application.types'
import { groupApplicationsByTagSet, sortGroupsByTagLabels, tagsKey } from '../application-history.utils'

function application(id: string, tagsIds: string[], date: string, createdAt = date): Application {
  return { id, tagsIds, date, createdAt } as Application
}

describe('histórico grouping', () => {
  test('one group per tag set, regardless of tag order', () => {
    expect(tagsKey(['b', 'a'])).toBe(tagsKey(['a', 'b']))
    const groups = groupApplicationsByTagSet([
      application('1', ['bloco', 'apto'], '2026-10-01'),
      application('2', ['apto', 'bloco'], '2026-10-05'),
      application('3', ['outro'], '2026-10-03'),
    ])
    expect(groups.map((g) => g.applications.map((a) => a.id))).toEqual([['2', '1'], ['3']])
  })

  test('same-day visits order by creation time, newest first', () => {
    const [group] = groupApplicationsByTagSet([
      application('morning', ['a'], '2026-10-01', '2026-10-01T09:00:00.000Z'),
      application('afternoon', ['a'], '2026-10-01', '2026-10-01T15:00:00.000Z'),
    ])
    expect(group.applications.map((a) => a.id)).toEqual(['afternoon', 'morning'])
  })
})

describe('histórico sort picker', () => {
  const groups = [
    { id: 'untagged', tagLabels: [] },
    { id: 'b10', tagLabels: ['Bloco 10'] },
    { id: 'b2', tagLabels: ['Bloco 2'] },
    { id: 'a', tagLabels: ['Apto'] },
  ]

  test('"recent" keeps the date order it was given', () => {
    expect(sortGroupsByTagLabels(groups, 'recent')).toBe(groups)
  })

  test('"numeric" puts Bloco 2 before Bloco 10, untagged last', () => {
    expect(sortGroupsByTagLabels(groups, 'numeric').map((g) => g.id)).toEqual(['a', 'b2', 'b10', 'untagged'])
  })

  test('"alpha" compares characters, untagged last', () => {
    expect(sortGroupsByTagLabels(groups, 'alpha').map((g) => g.id)).toEqual(['a', 'b10', 'b2', 'untagged'])
  })
})
