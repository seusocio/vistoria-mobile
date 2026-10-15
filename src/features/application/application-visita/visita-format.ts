import type { Note } from '@/features/note/shared/note.types'

/**
 * dd/mm/yyyy straight from the ISO string's date part — no timezone shift.
 * Not `formatBrDateShort`, which parses into local time and can land a day
 * earlier for a UTC-midnight date.
 */
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

/** "Hoje" / "Ontem" / dd/mm/yyyy, from a note's `createdAt` in local time. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86_400_000)
  if (diffDays === 0) return 'Hoje'
  if (diffDays === 1) return 'Ontem'
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

export function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? 'V').slice(0, 2)).toUpperCase()
}

/** Consecutive notes sharing a `dayLabel`, in feed order. */
export function groupNotesByDay(notes: Note[], now: Date = new Date()): { label: string; notes: Note[] }[] {
  const days: { label: string; notes: Note[] }[] = []
  for (const note of notes) {
    const label = dayLabel(note.createdAt, now)
    const last = days[days.length - 1]
    if (last?.label === label) last.notes.push(note)
    else days.push({ label, notes: [note] })
  }
  return days
}
