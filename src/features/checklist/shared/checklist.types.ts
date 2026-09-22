/** Not a closed set — checklists can have custom response options beyond these three canonical ones. */
export type ResponseSemantic = string

export interface ResponseOption {
  label: string
  semantic: ResponseSemantic
}

export const DEFAULT_RESPONSE_OPTIONS: ResponseOption[] = [
  { label: 'Sim', semantic: 'positivo' },
  { label: 'Não', semantic: 'negativo' },
  { label: 'Parcial', semantic: 'neutro' },
]


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


