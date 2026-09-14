export interface Tag {
  id: string
  label: string
  /** trim + lowercase of `label`, used to dedupe the global catalog */
  normalizedLabel: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export function normalizeTagLabel(label: string): string {
  return label.trim().toLowerCase()
}
