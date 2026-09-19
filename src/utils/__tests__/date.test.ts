import { describe, expect, test } from 'bun:test'
import { formatBrDate, formatBrDateShort } from '../date'

describe('formatBrDateShort / formatBrDate', () => {
  test('formats a valid ISO date', () => {
    expect(formatBrDateShort('2026-09-19T00:00:00.000Z')).not.toBe('')
    expect(formatBrDate('2026-09-19T00:00:00.000Z')).not.toBe('')
  })

  test('returns an empty string instead of throwing on an empty date', () => {
    // Regression: a real device crash ("INVALID TIME VALUE"). Intl.DateTimeFormat.format
    // throws on an invalid Date rather than returning a placeholder, and an
    // empty string is a real value here — an unsaved draft's default, an old
    // row from before a field existed — not corrupt data.
    expect(formatBrDateShort('')).toBe('')
    expect(formatBrDate('')).toBe('')
  })

  test('returns an empty string instead of throwing on a malformed date', () => {
    expect(formatBrDateShort('not-a-date')).toBe('')
    expect(formatBrDate('not-a-date')).toBe('')
  })
})
