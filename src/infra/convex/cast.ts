function stripSystemFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSystemFields)
  if (value === null || typeof value !== 'object') return value
  const { _id, _creationTime, ...rest } = value as Record<string, unknown>
  return rest
}

/**
 * Strips Convex's `_id`/`_creationTime` system fields so a document read
 * from a query can be handed back into a mutation whose validator doesn't
 * declare them (e.g. an `entity: checklistDoc` whole-document upsert).
 *
 * Deliberately dependency-free — no `convex/react`, no `expo-constants` —
 * so it can be imported from code that needs to run under `bun test`
 * (`src/lib/offline-queue/overlay.ts`) without pulling in the real
 * `react-native` package, which only parses under Metro/Babel.
 */
export function castConvex<T>(value: unknown): T {
  return stripSystemFields(value) as T
}
