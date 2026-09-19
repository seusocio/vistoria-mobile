import { useQuery } from 'convex-helpers/react/cache'
import type { FunctionReference } from 'convex/server'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { castConvex } from '@/infra/convex/cast'
import { getOp } from './ops'
import { useOutbox, type QueuedOp } from './queue.store'

/** Applies every pending op, in enqueue order, on top of the server's copy. */
export function applyOps<Entity>(entity: Entity | null, ops: QueuedOp[]): Entity | null {
  return ops.reduce<Entity | null>((current, item) => {
    const op = getOp(item.type)
    return op.applyLocal(current, item.args) as Entity | null
  }, entity)
}

/**
 * Reads one entity: the server's copy via `useQuery`, with every pending
 * outbox op for it applied on top. This is what makes a write feel instant
 * and stay durable across a restart — the outbox persists, and the overlay
 * re-applies it on every render until the server confirms and the op is
 * removed from the queue.
 *
 * Convex documents carry `_id`/`_creationTime`; `castConvex` strips them
 * (same helper `src/infra/convex/*-repository.ts` used) before this value
 * ever reaches an op's `applyLocal` — an op that re-sends the whole entity
 * (like `checklists.save`) would otherwise ship those system fields back to
 * a mutation validator that rejects them.
 */
export function useEntity<Entity>(
  query: FunctionReference<'query'>,
  args: Record<string, unknown>,
  entityId: string,
): Entity | null | undefined {
  const raw = useQuery(query, args)
  const server = raw === undefined ? undefined : castConvex<Entity | null>(raw)
  const pending = useOutbox(
    useShallow((state) => state.items.filter((item) => item.entityId === entityId)),
  )
  return useMemo(() => {
    if (server === undefined) return undefined
    return applyOps(server, pending)
  }, [server, pending])
}

/**
 * Reads a list: the server's copy, with pending patches applied to the rows
 * it already has, plus a row prepended for every pending `create` the
 * server hasn't caught up with yet. Without that second part, something
 * created offline would not show up in a list screen until the create
 * actually reached the server — which is exactly the "feels slow" bug this
 * whole queue exists to remove.
 */
export function useEntityList<Entity>(
  query: FunctionReference<'query'>,
  args: Record<string, unknown>,
  getId: (entity: Entity) => string,
): Entity[] | undefined {
  const raw = useQuery(query, args)
  const server = raw === undefined ? undefined : castConvex<Entity[]>(raw)
  const pending = useOutbox(useShallow((state) => state.items))

  return useMemo(() => {
    if (server === undefined) return undefined
    if (pending.length === 0) return server

    const opsByEntity = new Map<string, QueuedOp[]>()
    for (const item of pending) {
      const existing = opsByEntity.get(item.entityId)
      if (existing) existing.push(item)
      else opsByEntity.set(item.entityId, [item])
    }

    const serverIds = new Set(server.map(getId))
    const patched = server.map((entity) => {
      const ops = opsByEntity.get(getId(entity))
      return ops ? (applyOps(entity, ops) as Entity) : entity
    })

    const created: Entity[] = []
    for (const [entityId, ops] of opsByEntity) {
      if (serverIds.has(entityId)) continue
      const entity = applyOps<Entity>(null, ops)
      if (entity) created.push(entity)
    }

    return [...created, ...patched]
  }, [server, pending, getId])
}
