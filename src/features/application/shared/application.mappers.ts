import type {
  Application,
  ApplicationItem,
  Attachment,
  UploadStatus,
} from '@/features/application/shared/application.types'
import type { AddApplicationAttachmentBodyOne } from '@/lib/api/models/addApplicationAttachmentBodyOne'
import type { AddApplicationItemBodyOne } from '@/lib/api/models/addApplicationItemBodyOne'
import type { CreateApplicationBodyOne } from '@/lib/api/models/createApplicationBodyOne'
import type { UpdateApplicationBodyOne } from '@/lib/api/models/updateApplicationBodyOne'
import type { UpdateApplicationItemBodyOne } from '@/lib/api/models/updateApplicationItemBodyOne'

const UPLOAD_STATUSES: readonly UploadStatus[] = ['pending', 'uploaded', 'failed']

function toUploadStatus(raw: string): UploadStatus {
  return (UPLOAD_STATUSES as readonly string[]).includes(raw) ? (raw as UploadStatus) : 'uploaded'
}

/** The read-side normalizer for one attachment, shared by the application/item read mappers below and by the attachment write helpers (`addAttachmentRest` reads its own response through this same shape). */
export function fromAttachmentResponse(raw: Record<string, unknown>): Attachment {
  return {
    id: raw.id as string,
    name: raw.name as string,
    position: raw.position as number,
    createdAt: raw.createdAt as string,
    deletedAt: null,
    storageId: (raw.storageKey as string | null | undefined) ?? undefined,
    uploadStatus: toUploadStatus((raw.uploadStatus as string | undefined) ?? 'uploaded'),
    url: (raw.url as string | null | undefined) ?? undefined,
    mimeType: (raw.mimeType as string | null | undefined) ?? undefined,
    width: (raw.width as number | null | undefined) ?? undefined,
    height: (raw.height as number | null | undefined) ?? undefined,
  }
}

function fromItemResponse(raw: Record<string, unknown>): ApplicationItem {
  return {
    id: raw.id as string,
    position: raw.position as number,
    checklistItemId: (raw.checklistItemId as string | null | undefined) ?? null,
    parentId: (raw.parentId as string | null | undefined) ?? null,
    title: raw.title as string,
    description: (raw.description as string | undefined) ?? '',
    answer: (raw.answer as string | undefined) ?? '',
    answeredAt: (raw.answeredAt as string | null | undefined) ?? null,
    note: (raw.note as string | undefined) ?? '',
    quantity: (raw.quantity as number | null | undefined) ?? null,
    attachments: ((raw.attachments as Record<string, unknown>[] | undefined) ?? []).map(
      fromAttachmentResponse,
    ),
    tagsIds: (raw.tagsIds as string[] | undefined) ?? [],
    suggested: (raw.suggested as boolean | undefined) ?? false,
    suggestionSource: (raw.suggestionSource as ApplicationItem['suggestionSource']) ?? null,
    workflowStatus: (raw.workflowStatus as ApplicationItem['workflowStatus']) ?? null,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    deletedAt: null,
  }
}

/** The inverse of `toCreateApplicationBody`/`toUpdateApplicationBody` — see the module doc on `checklist.rest.ts` for why this cast-and-map boundary exists (the same oneOf-per-content-type spec split). */
export function fromApplicationResponse(raw: Record<string, unknown>): Application {
  return {
    id: raw.id as string,
    checklistId: raw.checklistId as string,
    tagsIds: (raw.tagsIds as string[] | undefined) ?? [],
    date: raw.date as string,
    status: raw.status as Application['status'],
    items: ((raw.items as Record<string, unknown>[] | undefined) ?? []).map(fromItemResponse),
    attachments: ((raw.attachments as Record<string, unknown>[] | undefined) ?? []).map(
      fromAttachmentResponse,
    ),
    gallerySourceApplicationId: (raw.gallerySourceApplicationId as string | null | undefined) ?? null,
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    completedAt: (raw.completedAt as string | null | undefined) ?? null,
    deletedAt: null,
    attachmentsCount: raw.attachmentsCount as number | undefined,
  }
}

export function asRecord(response: unknown): Record<string, unknown> {
  return response as Record<string, unknown>
}

export function toCreateApplicationBody(entity: Application): CreateApplicationBodyOne {
  return {
    id: entity.id,
    checklistId: entity.checklistId,
    tagsIds: entity.tagsIds,
    date: entity.date,
    status: entity.status,
    gallerySourceApplicationId: entity.gallerySourceApplicationId,
    items: entity.items.map(toAddItemBody),
  }
}

export interface UpdateMetaArgs {
  applicationId: string
  checklistId: string
  tagsIds?: string[]
  date?: string
  status?: Application['status']
  updatedAt: string
}

/**
 * `completedAt` isn't in this request body on purpose — `UpdateApplicationBodyOne`
 * doesn't accept it, and every call site that sets it locally
 * (`application-fill.container.ts`'s `handleComplete`) sets it in the same
 * breath as `status: 'completed'`, so the server deriving it from that
 * transition and returning its own value on the next read is equivalent —
 * the local optimistic overlay already shows the caller's value in the
 * meantime.
 */
export function toUpdateApplicationBody(args: UpdateMetaArgs): UpdateApplicationBodyOne {
  const body: UpdateApplicationBodyOne = { updatedAt: args.updatedAt }
  if (args.tagsIds !== undefined) body.tagsIds = args.tagsIds
  if (args.date !== undefined) body.date = args.date
  if (args.status !== undefined) body.status = args.status
  return body
}

export function toAddItemBody(item: ApplicationItem): AddApplicationItemBodyOne {
  return {
    id: item.id,
    checklistItemId: item.checklistItemId,
    parentId: item.parentId,
    position: item.position,
    title: item.title,
    description: item.description,
    tagsIds: item.tagsIds,
    answer: item.answer,
    answeredAt: item.answeredAt,
    note: item.note,
    quantity: item.quantity,
    suggested: item.suggested,
    suggestionSource: item.suggestionSource,
    workflowStatus: item.workflowStatus,
  }
}

/**
 * `updateApplicationItem` is a top-level `/application-items/{id}` resource
 * — `id` here is the *item's* id, not the application's; the application it
 * belongs to isn't part of the path or body at all. `patchItem`'s `applyLocal`
 * still needs `applicationId` to find which entity's overlay to patch
 * locally, but the REST call itself never uses it.
 */
export interface PatchItemArgs {
  itemId: string
  answer?: string
  note?: string
  quantity?: number | null
  tagsIds?: string[]
  suggested?: boolean
  suggestionSource?: ApplicationItem['suggestionSource']
  workflowStatus?: ApplicationItem['workflowStatus']
  updatedAt: string
}

export function toUpdateItemBody(args: PatchItemArgs): UpdateApplicationItemBodyOne {
  const body: UpdateApplicationItemBodyOne = { updatedAt: args.updatedAt }
  if (args.answer !== undefined) body.answer = args.answer
  if (args.note !== undefined) body.note = args.note
  if (args.quantity !== undefined) body.quantity = args.quantity
  if (args.tagsIds !== undefined) body.tagsIds = args.tagsIds
  if (args.suggested !== undefined) body.suggested = args.suggested
  if (args.suggestionSource !== undefined) body.suggestionSource = args.suggestionSource
  if (args.workflowStatus !== undefined) body.workflowStatus = args.workflowStatus
  return body
}

export function toAddAttachmentBody(itemId: string | null, attachment: Attachment): AddApplicationAttachmentBodyOne {
  return {
    attachments: [
      {
        id: attachment.id,
        itemId,
        name: attachment.name,
        mimeType: attachment.mimeType ?? null,
        position: attachment.position,
        width: attachment.width ?? null,
        height: attachment.height ?? null,
      },
    ],
  }
}
