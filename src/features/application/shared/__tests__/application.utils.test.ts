import { describe, expect, test } from 'bun:test'
import type { Application } from '../application.types'
import { findLatestApplicationByTagSet } from '../application.utils'

function application(
  id: string,
  tagsIds: string[],
  date: string,
  deletedAt: string | null = null,
): Application {
  return { id, tagsIds, date, deletedAt } as Application
}

describe('findLatestApplicationByTagSet', () => {
  const applications = [
    application('a', ['bloco1', 'apto10'], '2026-01-10T00:00:00.000Z'),
    application('b', ['apto10', 'bloco1'], '2026-03-01T00:00:00.000Z'),
    application('c', ['bloco2'], '2026-06-01T00:00:00.000Z'),
  ]

  test('matches a tag set regardless of order and takes the most recent', () => {
    expect(findLatestApplicationByTagSet(applications, ['bloco1', 'apto10'])?.id).toBe('b')
    expect(findLatestApplicationByTagSet(applications, ['apto10', 'bloco1'])?.id).toBe('b')
  })

  test('ignores partial matches and deleted applications', () => {
    expect(findLatestApplicationByTagSet(applications, ['bloco1'])).toBeNull()
    expect(
      findLatestApplicationByTagSet(
        [application('d', ['bloco3'], '2026-06-01T00:00:00.000Z', '2026-06-02T00:00:00.000Z')],
        ['bloco3'],
      ),
    ).toBeNull()
  })

  test('returns null for an empty tag set', () => {
    expect(findLatestApplicationByTagSet(applications, [])).toBeNull()
  })
})
