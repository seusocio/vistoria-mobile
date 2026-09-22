import { Application } from '@/features/application/shared/application.types'

/**
 * Backfills fields that legacy locally-stored applications predate, so they
 * satisfy the strict Convex schema on save (and read consistently).
 *
 * Records created before a field was introduced reach the persistence boundary
 * missing it:
 * - `answeredAt` (added later) — absent on old application items.
 * - attachment `name` — absent on old soft-deleted attachment tombstones.
 *
 * Pure and dependency-free (no Convex client) so it stays testable.
 */
export function normalizeApplication(application: Application): Application {
  return {
    ...application,
    attachments: (application.attachments ?? []).map((attachment) => ({
      ...attachment,
      name: attachment.name ?? '',
      deletedAt: attachment.deletedAt ?? null,
    })),
    gallerySourceApplicationId: application.gallerySourceApplicationId ?? null,
    items: application.items.map((item) => ({
      ...item,
      answeredAt: item.answeredAt ?? null,
      quantity: item.quantity ?? null,
      note: item.note ?? '',
      attachments: (item.attachments ?? []).map((attachment) => ({
        ...attachment,
        name: attachment.name ?? '',
        deletedAt: attachment.deletedAt ?? null,
      })),
      tagsIds: item.tagsIds ?? [],
      suggestionSource: item.suggestionSource ?? null,
      workflowStatus: item.workflowStatus ?? null,
    })),
  }
}
