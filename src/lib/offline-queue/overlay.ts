import { useIsRestoring, useQuery } from '@tanstack/react-query'
import { useConvex, useConvexConnectionState } from 'convex/react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { isRestEnabled } from '@/lib/backend-flags'
import { castConvex } from '@/lib/convex/cast'
import { getOp, type EntityKind } from './ops'
import { useOutbox, type QueuedOp } from './queue.store'

/**
 * The REST half of a read, already fetched by the caller through the
 * entity's own orval-generated hook (`useGetChecklist`, `useListChecklists`,
 * ...) rather than built here — that hook is a real `useQuery` under the
 * hood, called unconditionally with `enabled` gating whether it actually
 * fires, so it satisfies rules-of-hooks the same way the Convex query below
 * does. `useServerOrSnapshot` just picks whichever half matches the entity's
 * `isRestEnabled` flag — the Convex `query`/`args` stay required so an
 * entity keeps reading from Convex right up until this is supplied and its
 * flag flips, with no call site needing to change twice.
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
 * `useQuery` resolves only when the socket does. With no network it stays
 * `undefined` forever — so treating `undefined` as "still loading" is what
 * leaves every screen on a spinner in airplane mode.
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
 * query.
 *
 * Reads go through React Query rather than Convex's own reactive `useQuery`
 * now — a one-shot `convex.query` call wrapped as a `queryFn` — which is
 * also what survives a process kill: the persisted cache (`query-persister`)
 * is read from disk before the first fetch resolves, where Convex's own
 * query cache lived in memory only and had nothing to read until the socket
 * reconnected.
 *
 * `connected` still reads the Convex socket (not Seam E's `useIsOnline`),
 * even once an entity has cut over to REST: `useNetworkState` pulls in
 * `expo-network`, which transitively imports `react-native` in a way `bun
 * test` can't parse, and this function is reached by `overlay.test.ts` just
 * by importing the module. The socket state is a fine proxy either way — a
 * device with no network has no Convex socket either.
 *
 * `rest`, when given and the entity's flag is on, is read instead of the
 * Convex query's result — but the Convex `useQuery` below is still called on
 * every render either way (just `enabled: false` once REST is live), so hook
 * count/order never changes when the flag flips. That's what lets a
 * container decide Convex vs. REST from a plain flag check instead of
 * calling one hook or the other — a real conditional hook call here would
 * trip `react-hooks/rules-of-hooks`. The REST-backed `useQuery` this reads
 * from lives in the caller's own generated hook, gated the same way.
 */
function useServerOrSnapshot<Value>(
  query: FunctionReference<'query'>,
  args: Record<string, unknown>,
  kind: EntityKind,
  rest?: RestQueryResult<Value>,
): { value: Value | undefined; settled: boolean } {
  const convex = useConvex()
  const { isWebSocketConnected } = useConvexConnectionState()
  const isRestoring = useIsRestoring()
  const useRest = isRestEnabled(kind) && rest !== undefined
  const convexResult = useQuery<Value>({
    queryKey: [getFunctionName(query), args],
    queryFn: () => convex.query(query, args) as Promise<Value>,
    enabled: !useRest,
  })

  const data = useRest && rest ? rest.data : convexResult.data
  const isFetchedAfterMount = useRest && rest ? rest.isFetchedAfterMount : convexResult.isFetchedAfterMount

  return resolveOverlayBase<Value>({
    // Only this mount's own fetch counts as "the server answered" — data
    // present before that (restored from disk, or left from a previous
    // mount) is the cached fallback instead.
    server: isFetchedAfterMount ? data : undefined,
    cached: isFetchedAfterMount ? undefined : data,
    snapshotsHydrated: !isRestoring,
    connected: isWebSocketConnected,
  })
}

/**
 * Reads one entity: the server's copy (or the last one we saw), with every
 * pending outbox op for it applied on top. This is what makes a write feel
 * instant and stay durable across a restart — the outbox persists, and the
 * overlay re-applies it on every render until the server confirms and the
 * op is removed from the queue.
 *
 * Convex documents carry `_id`/`_creationTime`; `castConvex` strips them
 * before this value ever reaches an op's `applyLocal` — an op that re-sends
 * the whole entity (like `checklists.save`) would otherwise ship those
 * system fields back to a mutation validator that rejects them. A REST
 * response was never Convex-shaped, so once the entity's flag is on and
 * `rest` is actually in use, this skips the cast rather than running an
 * already-normalized value through a Convex-specific strip.
 */
export function useEntity<Entity>(
  query: FunctionReference<'query'>,
  args: Record<string, unknown>,
  entityId: string,
  kind: EntityKind,
  rest?: RestQueryResult<Entity | null>,
): Entity | null | undefined {
  const usingRest = isRestEnabled(kind) && rest !== undefined
  const { value, settled } = useServerOrSnapshot<unknown>(query, args, kind, rest)
  const base =
    value === undefined ? undefined : usingRest ? (value as Entity | null) : castConvex<Entity | null>(value)
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
 * than waiting forever when there is no cache and no socket: a first launch
 * with no network opens on an empty Library instead of a spinner.
 */
export function useEntityList<Entity>(
  query: FunctionReference<'query'>,
  args: Record<string, unknown>,
  options: EntityListOptions<Entity>,
  rest?: RestQueryResult<Entity[]>,
): Entity[] | undefined {
  const { kind, getId, belongs } = options
  const usingRest = isRestEnabled(kind) && rest !== undefined
  const { value, settled } = useServerOrSnapshot<unknown>(query, args, kind, rest)
  const server =
    value === undefined ? undefined : usingRest ? (value as Entity[]) : castConvex<Entity[]>(value)
  const pending = useOutbox(useShallow((state) => state.items.filter((item) => item.kind === kind)))

  return useMemo(() => {
    if (server === undefined && !settled) return undefined
    return mergePendingIntoList(server ?? [], pending, { kind, getId, belongs })
  }, [server, settled, pending, kind, getId, belongs])
}
