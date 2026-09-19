const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR')

/**
 * `Intl.DateTimeFormat.format` throws "Invalid time value" on an invalid
 * Date, not just returns a placeholder — and an empty/malformed `iso` is a
 * real possibility here (an unsaved draft's default value, an old row from
 * before a field existed), not corrupt data. These are display helpers, not
 * validators; a blank label beats crashing the whole screen.
 */
export function formatBrDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : LONG_DATE_FORMATTER.format(date)
}

export function formatBrDateShort(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : SHORT_DATE_FORMATTER.format(date)
}

export function todayIso(): string {
  return new Date().toISOString()
}

export function shiftDateIso(iso: string, days: number): string {
  const date = new Date(iso)
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

export function startOfDayIso(iso: string): string {
  const date = new Date(iso)
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

export function endOfDayIso(iso: string): string {
  const date = new Date(iso)
  date.setHours(23, 59, 59, 999)
  return date.toISOString()
}

export function startOfMonthIso(iso: string): string {
  const date = new Date(iso)
  date.setDate(1)
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}
