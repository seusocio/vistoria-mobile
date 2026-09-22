import { defineOp } from '@/lib/offline-queue/ops'
import type { Tag } from '@/features/tag/shared/tag.types'
import { api } from '../../../../convex/_generated/api'

/**
 * Mirrors `tags.create`, which dedupes on both the external id and the
 * normalized label — replaying it is a no-op either way, which is what lets
 * a tag typed offline survive a kill and reach the server later.
 *
 * Going through the outbox also fixes a real hang: applying a checklist
 * template awaits one `createTag` per label, and with no network those
 * awaits never settled.
 */
export const tagCreate = defineOp<{ entity: Tag }, Tag>('tags.create', {
  kind: 'tag',
  mutation: api.tags.create,
  applyLocal: (entity, args) => entity ?? args.entity,
  entityId: (args) => args.entity.id,
})
