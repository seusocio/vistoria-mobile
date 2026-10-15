import type { Query } from '@tanstack/react-query'
import type { QueuedOp } from '@/lib/offline-queue'

const MAX_JSON = 4000

export function json(value: unknown): string {
  let text: string
  try {
    text = JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    text = String(value)
  }
  return text.length > MAX_JSON ? `${text.slice(0, MAX_JSON)}\n… (${text.length - MAX_JSON} more chars)` : text
}

export function time(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString('pt-BR')
}

export function keyLabel(query: Query): string {
  return JSON.stringify(query.queryKey)
}

/** A one-line size hint for cached data: rows in a list, rows across an infinite list's pages. */
function dataShape(data: unknown): string {
  if (data === undefined) return 'no data'
  if (Array.isArray(data)) return `${data.length} rows`
  if (data && typeof data === 'object') {
    const pages = (data as { pages?: Array<{ items?: unknown[] }> }).pages
    if (Array.isArray(pages)) return `${pages.length} pages, ${pages.reduce((n, page) => n + (page.items?.length ?? 0), 0)} rows`
    const rows = (data as { data?: unknown }).data
    if (Array.isArray(rows)) return `${rows.length} rows`
    return 'object'
  }
  return typeof data
}

export function querySummary(query: Query) {
  return {
    key: query.queryKey,
    status: query.state.status,
    fetchStatus: query.state.fetchStatus,
    stale: query.isStale(),
    observers: query.getObserversCount(),
    updatedAt: query.state.dataUpdatedAt ? new Date(query.state.dataUpdatedAt).toISOString() : null,
    data: dataShape(query.state.data),
    error: query.state.error instanceof Error ? query.state.error.message : (query.state.error ?? null),
  }
}

export function attachmentIdOf(item: QueuedOp): string | undefined {
  const args = item.args as { attachmentId?: string; attachment?: { id?: string } } | null
  return args?.attachmentId ?? args?.attachment?.id
}

export function age(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}
