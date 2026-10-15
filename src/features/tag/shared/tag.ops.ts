import { defineOp } from '@/lib/offline-queue/ops'
import type { Tag } from '@/features/tag/shared/tag.types'
import { createTagRest, tagsListQueryKey } from '@/features/tag/shared/tag.rest'
import { requireActiveProject } from '@/lib/session/require-active-project'

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
  send: (args) => {
    const { orgId, projectId } = requireActiveProject('tags')
    return createTagRest(orgId, projectId, args.entity)
  },
  applyLocal: (entity, args) => entity ?? args.entity,
  entityId: (args) => args.entity.id,
  // No per-tag GET endpoint exists (only the list) — unlike checklists,
  // there's no single query to write the server's response into, so this
  // relies purely on invalidating the list. The local overlay already shows
  // the created tag instantly via `applyLocal`; this just brings the list
  // query's own cache in line once the server has it.
  invalidates: () => {
    const { orgId, projectId } = requireActiveProject('tags')
    return [tagsListQueryKey(orgId, projectId)]
  },
})
