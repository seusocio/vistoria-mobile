export type UploadStatus = 'pending' | 'uploaded' | 'failed'

export interface Attachment {
  id: string
  name: string
  position: number
  createdAt: string
  deletedAt: string | null
  storageId?: string
  localUri?: string
  uploadStatus?: UploadStatus
  url?: string
  mimeType?: string
  width?: number
  height?: number
}

export type SuggestionSource = 'transcript' | 'previous_application'

/** In-progress states derived from "not complete" - see `answer` for the completed/not-completed binary. */
export type WorkflowStatus = 'in_progress' | 'in_review' | 'denied'

export interface ApplicationItem {
  id: string
  position: number
  /** id of the checklist template item this was copied from; null for ad-hoc items added in this application only */
  checklistItemId?: string | null
  /** id of the group/section header item this belongs to; null/undefined for top-level items (including the headers themselves) and ad-hoc items */
  parentId?: string | null
  title: string
  description: string
  /** label of the chosen ResponseOption, empty when unanswered */
  answer: string
  /** moment the current answer was set, null while unanswered; distinct from updatedAt which also changes on note/tag/attachment edits */
  answeredAt: string | null
  note: string
  quantity: number | null
  attachments: Attachment[]
  /** tags of the catalog global, e.g. responsible for this specific item */
  tagsIds: string[]
  /** true while an answer/note came from a voice or previous-visit suggestion */
  suggested: boolean
  suggestionSource: SuggestionSource | null
  workflowStatus: WorkflowStatus | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type ApplicationStatus = 'draft' | 'completed'

export interface Application {
  id: string
  checklistId: string
  /** tags of the catalog global (tower, unit, responsible, ...); at least 1 required */
  tagsIds: string[]
  date: string
  status: ApplicationStatus
  items: ApplicationItem[]
  /** attachments belonging to the visit itself, separate from item attachments */
  attachments: Attachment[]
  /** points to the previous visit gallery when a new visit was repeated */
  gallerySourceApplicationId: string | null
  /** latest voice transcript for this visit, when any */
  transcript: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
  deletedAt: string | null
  /**
   * Counts the server derives from the items/attachments it holds, present
   * only on an application that came back from the API. A locally built one
   * (`buildApplication`, or one reconstructed by a pending `create` op) leaves
   * them undefined, so every reader needs a fallback that counts `items`
   * itself — `countNegativeAnswers` for the negative badge.
   *
   * They exist so a list screen can render a card without asking for
   * `include=items,attachments`: the histórico's group read
   * (`useApplicationGroupsRestResult`) has no `include` at all, which is the
   * whole point of that endpoint, and these four are what survives it.
   */
  answeredCount?: number
  totalCount?: number
  negativeCount?: number
  attachmentsCount?: number
}
