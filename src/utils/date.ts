export function formatBrDate(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export function formatBrDateShort(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString('pt-BR')
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
