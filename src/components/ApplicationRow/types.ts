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
  onOpenEntry: (id: string) => void
  onRepeat: () => void
  onEditTags?: () => void
  defaultExpanded?: boolean
}
