import { useIsRestoring, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useLinkState } from './link-state'
import { getOp, type EntityKind } from './ops'
import { useOutbox, type QueuedOp } from './queue.store'

/**
 * A read, already fetched by the caller through the entity's own
 * orval-generated hook (`useGetChecklist`, `useListChecklists`, ...). The
 * caller passes `undefined` while it can't fetch at all (no active
 * org/project yet).
 */
export interface RestQueryResult<Value> {
  data: Value | undefined
  isFetchedAfterMount: boolean
}

/**
 * Applies every pending op, in enqueue order, on top of the server's copy.
 * An op whose definition is missing from this build is skipped rather than
 * thrown on — this runs during render, and the drain already surfaces that
 * op as failed.
 */
export function applyOps<Entity>(entity: Entity | null, ops: QueuedOp[]): Entity | null {
  return ops.reduce<Entity | null>((current, item) => {
    const op = getOp(item.type)
    if (!op) return current
    return op.applyLocal(current, item.args) as Entity | null
  }, entity)
}

/**
 * Decides what the overlay reads from, and whether "nothing" is an answer or
 * a wait. Pure, because this is the decision that decides whether the app
 * works at all with no network.
 *
 * With no network the read never resolves, so treating `undefined` as
 * "still loading" is what leaves every screen on a spinner in airplane mode.
 */
export function resolveOverlayBase<Value>(input: {
  /** The server's answer, `undefined` while it hasn't arrived. */
  server: Value | undefined
  /** The last answer we persisted for this query, if any. */
  cached: Value | undefined
  /** False until the on-disk snapshots have been read. */
  snapshotsHydrated: boolean
  connected: boolean
}): { value: Value | undefined; settled: boolean } {
  const { server, cached, snapshotsHydrated, connected } = input
  if (server !== undefined) return { value: server, settled: true }
  if (snapshotsHydrated && cached !== undefined) return { value: cached, settled: true }
  // Nothing known yet. Only keep waiting while an answer can actually
  // arrive — still reading from disk, or connected with a query in flight.
  return { value: undefined, settled: snapshotsHydrated && !connected }
}

/**
 * The base the overlay applies pending ops onto: the server's answer when
 * there is one, otherwise the last answer React Query persisted for this
 * query — the persisted cache (`query-persister`) is read from disk before
 * the first fetch resolves, which is what survives a process kill.
 */
function useServerOrSnapshot<Value>(
  rest: RestQueryResult<Value> | undefined,
): { value: Value | undefined; settled: boolean } {
  const isRestoring = useIsRestoring()
  const connected = useLinkState((state) => state.isOnline)
  const data = rest?.data
  const isFetchedAfterMount = rest?.isFetchedAfterMount ?? false

  return resolveOverlayBase<Value>({
    // Only this mount's own fetch counts as "the server answered" — data
    // present before that (restored from disk, or left from a previous
    // mount) is the cached fallback instead.
    server: isFetchedAfterMount ? data : undefined,
    cached: isFetchedAfterMount ? undefined : data,
    snapshotsHydrated: !isRestoring,
    connected,
  })
}

/**
 * Reads one entity: the server's copy (or the last one we saw), with every
 * pending outbox op for it applied on top. This is what makes a write feel
 * instant and stay durable across a restart — the outbox persists, and the
 * overlay re-applies it on every render until the server confirms and the
 * op is removed from the queue.
 */
export function useEntity<Entity>(
  rest: RestQueryResult<Entity | null> | undefined,
  entityId: string,
  kind: EntityKind,
): Entity | null | undefined {
  const { value: base, settled } = useServerOrSnapshot(rest)
  const pending = useOutbox(
    useShallow((state) =>
      state.items.filter((item) => item.kind === kind && item.entityId === entityId),
    ),
  )

  return useMemo(() => {
    if (base !== undefined) return applyOps(base, pending)
    // Never seen this entity. A pending `create` can still build it locally —
    // that is a vistoria started offline, which has to open.
    const local = applyOps<Entity>(null, pending)
    if (local) return local
    // Offline with nothing to show is an answer ("not here"), not a wait.
    return settled ? null : undefined
  }, [base, pending, settled])
}

export interface EntityListOptions<Entity> {
  /** Only ops of this kind are applied — see `EntityKind`. */
  kind: EntityKind
  getId: (entity: Entity) => string
  /**
   * For a list the server already filters (`listByChecklistId`), says whether
   * a locally-created entity belongs in *this* list. Without it, an entity
   * created offline shows up in every list reading the same kind.
   */
  belongs?: (entity: Entity) => boolean
}

/**
 * The list merge, as a pure function: the server's rows with pending patches
 * folded in, plus a row for every pending entity the server doesn't have yet.
 *
 * `pending` must already be filtered to a single `kind`. Without that, a
 * pending `checklists.save` looks exactly like "an entity this list doesn't
 * have yet" and gets injected into the list of applications.
 */
export function mergePendingIntoList<Entity>(
  server: Entity[],
  pending: QueuedOp[],
  options: EntityListOptions<Entity>,
): Entity[] {
  const { getId, belongs } = options
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
    if (!entity) continue
    if (belongs && !belongs(entity)) continue
    created.push(entity)
  }

  return created.length === 0 ? patched : [...created, ...patched]
}

/**
 * Reads a list: the server's copy (or the last one we saw), with pending
 * patches applied to the rows it already has, plus a row prepended for every
 * pending `create` the server hasn't caught up with yet. Without that second
 * part, something created offline would not show up in a list screen until
 * the create actually reached the server — which is exactly the "feels slow"
 * bug this whole queue exists to remove.
 *
 * An empty list is a valid offline answer, so this resolves to `[]` rather
 * than waiting forever when there is no cache and no network: a first launch
 * with no network opens on an empty Library instead of a spinner.
 */
export function useEntityList<Entity>(
  rest: RestQueryResult<Entity[]> | undefined,
  options: EntityListOptions<Entity>,
): Entity[] | undefined {
  const { kind, getId, belongs } = options
  const { value: server, settled } = useServerOrSnapshot(rest)
  const pending = useOutbox(useShallow((state) => state.items.filter((item) => item.kind === kind)))

  return useMemo(() => {
    if (server === undefined && !settled) return undefined
    return mergePendingIntoList(server ?? [], pending, { kind, getId, belongs })
  }, [server, settled, pending, kind, getId, belongs])
}
