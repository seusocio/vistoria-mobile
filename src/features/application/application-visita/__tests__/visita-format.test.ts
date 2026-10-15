import { describe, expect, test } from 'bun:test'
import type { Note } from '@/features/note/shared/note.types'
import { fmtDate, groupNotesByDay, initials } from '../visita-format'

const NOW = new Date(2026, 9, 15, 14, 0) // 15/10/2026, local time

function note(id: string, createdAt: Date): Note {
  return { id, createdAt: createdAt.toISOString() } as Note
}

describe('activity feed day headers', () => {
  test('consecutive notes share "Hoje" / "Ontem" / dd/mm/yyyy headers, in feed order', () => {
    const days = groupNotesByDay(
      [
        note('n1', new Date(2026, 9, 15, 9, 30)),
        note('n2', new Date(2026, 9, 15, 0, 5)),
        note('n3', new Date(2026, 9, 14, 23, 59)),
        note('n4', new Date(2026, 9, 2, 12, 0)),
      ],
      NOW,
    )
    expect(days.map((d) => [d.label, d.notes.map((n) => n.id)])).toEqual([
      ['Hoje', ['n1', 'n2']],
      ['Ontem', ['n3']],
      ['02/10/2026', ['n4']],
    ])
  })

  test('an empty feed has no days', () => {
    expect(groupNotesByDay([], NOW)).toEqual([])
  })
})

describe('visit header', () => {
  test('the visit date is read off the ISO date part, with no timezone shift', () => {
    expect(fmtDate('2026-10-01T00:00:00.000Z')).toBe('01/10/2026')
    expect(fmtDate('')).toBe('')
  })

  test('the avatar shows the first letters of the first two words', () => {
    expect(initials('Torre Norte bloco 2')).toBe('TN')
    expect(initials('  vistoria ')).toBe('VI')
    expect(initials('')).toBe('V')
  })
})
