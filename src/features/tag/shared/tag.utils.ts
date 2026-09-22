import { Tag } from '@/features/tag/shared/tag.types'

/**
 * Maps tag ids to their labels for display, dropping ids whose tag is gone.
 * The catalog itself is read through the overlay (`useTagsCatalog`), so this
 * stays a pure lookup with no data access of its own.
 */
export function resolveTagLabels(
  tagsIds: string[],
  tagsById: Map<string, Tag>,
): string[] {
  return tagsIds
    .map((id) => tagsById.get(id)?.label)
    .filter((label): label is string => Boolean(label))
}
