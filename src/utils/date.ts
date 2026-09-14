const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR')

export function formatBrDate(iso: string): string {
  return LONG_DATE_FORMATTER.format(new Date(iso))
}

export function formatBrDateShort(iso: string): string {
  return SHORT_DATE_FORMATTER.format(new Date(iso))
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
