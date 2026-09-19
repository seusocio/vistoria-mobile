import { ConvexReactClient } from 'convex/react'
import Constants from 'expo-constants'

const configuredUrl = Constants.expoConfig?.extra?.convexUrl

if (typeof configuredUrl !== 'string' || configuredUrl.length === 0) {
  throw new Error(
    'Convex URL não configurada. Defina CONVEX_URL no ambiente do Expo.',
  )
}

export const convexClient = new ConvexReactClient(configuredUrl, {
  unsavedChangesWarning: false,
})

function stripSystemFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSystemFields)
  if (value === null || typeof value !== 'object') return value
  const { _id, _creationTime, ...rest } = value as Record<string, unknown>
  return rest
}

export function castConvex<T>(value: unknown): T {
  return stripSystemFields(value) as T
}
