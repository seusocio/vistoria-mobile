import { ZodType } from 'zod'

/** Parses with a zod schema and throws a plain Error carrying the first issue's message, matching the service layer's existing `throw new Error(...)` contract. */
export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? 'Dados inválidos')
  }
  return result.data
}
