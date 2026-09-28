import type { EntityKind } from '@/lib/offline-queue'

/**
 * Per-entity cutover switch for the Convex → Vistoria REST migration. Every
 * entity is `false` until its op bodies (Seam A) and reads (Seam C) are
 * actually wired to the REST endpoints — flipping one here without that
 * wiring would just point the app at a backend that doesn't answer yet.
 */
const REST_ENABLED: Record<EntityKind, boolean> = {
  application: true,
  checklist: true,
  tag: true,
}

export function isRestEnabled(kind: EntityKind): boolean {
  return REST_ENABLED[kind]
}
