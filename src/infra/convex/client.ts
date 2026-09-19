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

export { castConvex } from './cast'
