import AsyncStorage from '@react-native-async-storage/async-storage'
import { isRestEnabled } from '@/lib/backend-flags'
import { convexClient } from '@/lib/convex/client'
import { normalizeApplication } from '@/lib/convex/normalize'
import type { Application } from '@/features/application/shared/application.types'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import type { Tag } from '@/features/tag/shared/tag.types'
import { api } from '../../../convex/_generated/api'

/**
 * One-shot import of data written by the pre-Convex builds, which kept the
 * three collections in AsyncStorage.
 *
 * This used to gate the splash screen: `App.tsx` awaited it before rendering
 * anything and showed a full-screen error if it threw, which meant a first
 * launch with no network never got past the splash. It now runs after the
 * first render and fails in silence — there is nothing to report to the user
 * about data they may not even have, and the next launch tries again.
 *
 * Deliberately not routed through the outbox: this is a legacy path that
 * only ever runs on devices upgrading from those builds, and queueing an
 * unbounded import behind every other pending write would delay the writes
 * the user is making right now.
 */
const KEYS = {
  TAGS: '@vistoria/tags',
  CHECKLISTS: '@vistoria/checklists',
  APPLICATIONS: '@vistoria/applications',
  MIGRATED: '@vistoria/convex-migrated',
} as const

async function readCollection<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

/**
 * The three kinds this import writes. Once all of them read from REST, every
 * mutation below targets a backend nothing in the app queries anymore.
 */
const MIGRATION_KINDS = ['tag', 'checklist', 'application'] as const

export async function migrateLocalDataToConvex(): Promise<void> {
  if (await AsyncStorage.getItem(KEYS.MIGRATED)) return

  // Past the REST cutover this import has no destination: anything it pushed
  // into Convex would be invisible to every read in the app. It was also
  // *loud* about it — `App.tsx` runs this on every launch and the flag below
  // is only set on success, so a device with legacy data logged a
  // `[CONVEX M(checklists:save)]` failure for each entity, on every boot,
  // forever.
  //
  // Returning without setting `MIGRATED` is deliberate: the legacy keys stay
  // untouched in AsyncStorage, so a REST-side import can still find that data
  // if one is ever needed. Marking it migrated here would be the one action
  // that really does lose it.
  if (MIGRATION_KINDS.every(isRestEnabled)) return

  const [tags, checklists, applications] = await Promise.all([
    readCollection<Tag>(KEYS.TAGS),
    readCollection<Checklist>(KEYS.CHECKLISTS),
    readCollection<Application>(KEYS.APPLICATIONS),
  ])

  if (tags.length === 0 && checklists.length === 0 && applications.length === 0) {
    await AsyncStorage.setItem(KEYS.MIGRATED, '1')
    return
  }

  await Promise.all(
    tags.map((entity) => convexClient.mutation(api.tags.create, { entity })),
  )
  await Promise.all(
    checklists.map((entity) =>
      convexClient.mutation(api.checklists.save, { id: entity.id, entity }),
    ),
  )
  await Promise.all(
    applications.map((application) =>
      convexClient.mutation(api.applications.create, {
        entity: normalizeApplication(application),
      }),
    ),
  )

  await AsyncStorage.setItem(KEYS.MIGRATED, '1')
}
