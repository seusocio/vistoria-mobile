import type { Application } from '@/features/application/shared/application.types'

export interface ApplicationGroup {
  key: string
  tagsIds: string[]
  applications: Application[]
}

/**
 * The order-insensitive identity of a tag set — `[a, b]` and `[b, a]` key the
 * same group. Exported because the histórico's groups now arrive from the
 * server keyed on the same (sorted) tag set, and the screen still has to
 * produce a list key for them: one implementation of the key, used on both the
 * server-grouped and the locally-grouped path.
 */
export function tagsKey(tagsIds: string[]): string {
  return [...tagsIds].sort().join('|')
}

export function groupApplicationsByTagSet(
  applications: Application[],
): ApplicationGroup[] {
  const groups = new Map<string, ApplicationGroup>()
  for (const application of applications) {
    const key = tagsKey(application.tagsIds)
    const existing = groups.get(key)
    if (existing) {
      existing.applications.push(application)
    } else {
      groups.set(key, {
        key,
        tagsIds: application.tagsIds,
        applications: [application],
      })
    }
  }

  const result = Array.from(groups.values())
  for (const group of result) {
    group.applications.sort(compareApplicationRecency)
  }
  result.sort((a, b) => compareApplicationRecency(a.applications[0], b.applications[0]))
  return result
}

/**
 * Descending recency: by `date` first, falling back to `createdAt` when two
 * applications share the same `date` (same-day repeat visits, or one edited
 * by hand to match another) - without it, a tie resolves to whichever
 * application happened to come first in the input array instead of the one
 * actually created last.
 */
function compareApplicationRecency(a: Application, b: Application): number {
  const byDate = new Date(b.date).getTime() - new Date(a.date).getTime()
  if (byDate !== 0) return byDate
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

/**
 * The most recent application sharing exactly the given tag set, or null.
 *
 * Same equality as `groupApplicationsByTagSet` (order-insensitive), so
 * picking a tag set that already exists in the histórico finds the very
 * application the group's "repetir" button would have copied from.
 */
export function findLatestApplicationByTagSet(
  applications: Application[],
  tagsIds: string[],
): Application | null {
  if (tagsIds.length === 0) return null
  const key = tagsKey(tagsIds)
  let latest: Application | null = null
  for (const application of applications) {
    if (application.deletedAt) continue
    if (tagsKey(application.tagsIds) !== key) continue
    if (!latest || compareApplicationRecency(application, latest) < 0) {
      latest = application
    }
  }
  return latest
}

export type HistorySortMode = 'recent' | 'alpha' | 'numeric'

const NUMERIC_CHUNK = /(\d+|\D+)/g

/**
 * Natural-order comparator: splits both strings into runs of digits and
 * non-digits and compares digit runs by numeric value instead of character
 * code, so "Bloco 10" sorts after "Bloco 2".
 *
 * Deliberately hand-rolled instead of `localeCompare(..., { numeric: true })`
 * - Hermes (the RN engine) doesn't reliably honor that Intl.Collator option,
 * so on-device it silently fell back to plain string comparison and put
 * "101" before "99" (`'1' < '9'` as characters). This has no Intl dependency,
 * so it behaves the same in tests (Bun/V8) and on-device (Hermes/JSC).
 */
function naturalCompare(a: string, b: string): number {
  const aParts = a.match(NUMERIC_CHUNK) ?? []
  const bParts = b.match(NUMERIC_CHUNK) ?? []
  const length = Math.max(aParts.length, bParts.length)
  for (let i = 0; i < length; i++) {
    const aPart = aParts[i] ?? ''
    const bPart = bParts[i] ?? ''
    if (aPart === bPart) continue
    const aNum = /^\d+$/.test(aPart) ? Number(aPart) : null
    const bNum = /^\d+$/.test(bPart) ? Number(bPart) : null
    if (aNum !== null && bNum !== null) {
      if (aNum !== bNum) return aNum - bNum
      continue
    }
    return aPart < bPart ? -1 : 1
  }
  return 0
}

/**
 * Reorders groups by their tag labels — the only field the histórico's sort
 * picker touches, per the "considere apenas tags" requirement. `recent`
 * leaves `groupApplicationsByTagSet`'s own date order alone; `alpha` does a
 * plain case-insensitive compare of the joined labels, `numeric` runs them
 * through `naturalCompare` instead.
 *
 * Untagged groups have nothing to sort by, so they're pinned to the end
 * regardless of mode rather than landing wherever an empty string collates.
 */
export function sortGroupsByTagLabels<T extends { tagLabels: string[] }>(
  groups: T[],
  mode: HistorySortMode,
): T[] {
  if (mode === 'recent') return groups
  return [...groups].sort((a, b) => {
    const aUntagged = a.tagLabels.length === 0
    const bUntagged = b.tagLabels.length === 0
    if (aUntagged !== bUntagged) return aUntagged ? 1 : -1
    const aLabel = a.tagLabels.join(' ')
    const bLabel = b.tagLabels.join(' ')
    return mode === 'numeric'
      ? naturalCompare(aLabel, bLabel)
      : aLabel.localeCompare(bLabel, 'pt-BR', { sensitivity: 'base' })
  })
}
