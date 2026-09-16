import { ResponseOption } from './response-option'

export interface ChecklistItem {
  id: string
  position: number
  title: string
  description: string
  /** tags of the catalog global, e.g. default responsible for this item */
  tagsIds: string[]
  /** id of the group/section header item this belongs to; null/undefined for top-level items (including the headers themselves) */
  parentId?: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type ChecklistSource = 'manual' | 'audio_suggestion'

export interface Checklist {
  id: string
  title: string
  tagsIds: string[]
  options: ResponseOption[]
  source: ChecklistSource
  items: ChecklistItem[]
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}
