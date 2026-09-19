import type { Checklist, ChecklistItem } from '@/infra/domain/entities'
import { DEFAULT_RESPONSE_OPTIONS } from '@/infra/domain/entities'
import { generateId } from '@/infra/id'
import type { ChecklistFormValues, ChecklistItemFormValues } from './checklist-form.schema'

function buildChecklistItem(
  input: ChecklistItemFormValues,
  position: number,
  prior?: ChecklistItem,
): ChecklistItem {
  const now = new Date().toISOString()
  if (prior) {
    return {
      ...prior,
      position,
      title: input.title.trim(),
      description: input.description?.trim() ?? prior.description,
      tagsIds: input.tagsIds ?? prior.tagsIds,
      updatedAt: now,
    }
  }
  return {
    id: input.id ?? generateId('citem_'),
    position,
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    tagsIds: input.tagsIds ?? [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

/**
 * Builds the full `Checklist` document from form values. `checklistFormSchema`
 * already guarantees a non-empty title and at least one item with a
 * non-empty title by the time this runs (via useDraft's zodResolver), so
 * this is a pure transform — no validation left to duplicate here.
 *
 * Pass `existing: null` to create; pass the current entity to update, so
 * unmodified items keep their id, `createdAt`, and any fields the form
 * doesn't own.
 */
export function buildChecklistEntity(
  existing: Checklist | null,
  values: ChecklistFormValues,
): Checklist {
  const now = new Date().toISOString()
  const existingById = new Map((existing?.items ?? []).map((item) => [item.id, item]))
  const items = values.items
    .filter((item) => item.title.trim().length > 0)
    .map((item, index) =>
      buildChecklistItem(item, index, item.id ? existingById.get(item.id) : undefined),
    )

  if (existing) {
    return {
      ...existing,
      title: values.title.trim(),
      tagsIds: values.tagsIds,
      options: values.options.length > 0 ? values.options : existing.options,
      items,
      updatedAt: now,
    }
  }

  return {
    id: generateId('checklist_'),
    title: values.title.trim(),
    tagsIds: values.tagsIds,
    options: values.options.length > 0 ? values.options : DEFAULT_RESPONSE_OPTIONS,
    source: 'manual',
    items,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}
