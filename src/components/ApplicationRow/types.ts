import type { BadgeTone } from '../Badge'

export interface ApplicationRowEntry {
  id: string
  dateLabel: string
  negativeCount: number
  /** Drives the dense layout's per-row tick; the detailed layout shows status only for the group. */
  status?: 'draft' | 'completed'
}

export interface ApplicationRowProps {
  tagLabels: string[]
  latestStatusLabel: string
  latestStatusTone: BadgeTone
  entries: ApplicationRowEntry[]
  /**
   * Visits in the group, when that differs from `entries.length` — the
   * histórico's read truncates the visits it embeds per group but reports the
   * real total, and the count the card shows has to be the total. Defaults to
   * `entries.length`.
   */
  visitsCount?: number
  onOpenEntry: (id: string) => void
  onRepeat: () => void
  onEditTags?: () => void
  defaultExpanded?: boolean
  /**
   * First card in the list. Suppresses the separating rule: the card draws it
   * on its top edge, and the first one has nothing above it to be separated
   * from - the rule would just hang under the section title.
   */
  first?: boolean
}
