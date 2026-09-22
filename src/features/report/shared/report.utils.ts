import { Application } from '@/features/application/shared/application.types'

export interface ReportPendingItem {
  applicationId: string
  itemId: string
  itemTitle: string
}

export interface ReportPendingGroup {
  application: Application
  items: ReportPendingItem[]
}

export interface ReportResult {
  itemProgress: { answered: number; total: number }
  applicationProgress: { completed: number; total: number }
  pendingGroups: ReportPendingGroup[]
}

/** inclusive range, both bounds as ISO datetime strings */
export interface DateRange {
  from: string
  to: string
}

function applicationMatchesTags(
  application: Application,
  tagIds: string[],
): boolean {
  const appTagSet = new Set(application.tagsIds)
  return tagIds.every((tagId) => {
    if (appTagSet.has(tagId)) return true
    return application.items.some((item) => item.tagsIds.includes(tagId))
  })
}

function applicationInRange(
  application: Application,
  range: DateRange | null,
): boolean {
  if (!range) return true
  const time = new Date(application.date).getTime()
  return time >= new Date(range.from).getTime() && time <= new Date(range.to).getTime()
}

export function queryApplicationsByTags(
  applications: Application[],
  tagIds: string[],
  dateRange: DateRange | null = null,
): ReportResult {
  const matching = applications
    .filter((application) => applicationMatchesTags(application, tagIds))
    .filter((application) => applicationInRange(application, dateRange))

  let answered = 0
  let total = 0
  let completed = 0
  const pendingGroups: ReportPendingGroup[] = []

  for (const application of matching) {
    const appTagSet = new Set(application.tagsIds)
    const missingAtAppLevel = tagIds.filter((tagId) => !appTagSet.has(tagId))
    // tags not carried by the application itself must be matched item-by-item,
    // otherwise counting/progress would attribute the whole application to a
    // tag that only one of its items actually has (e.g. a single person)
    const scopedItems =
      missingAtAppLevel.length === 0
        ? application.items
        : application.items.filter((item) =>
            missingAtAppLevel.every((tagId) => item.tagsIds.includes(tagId)),
          )

    total += scopedItems.length
    answered += scopedItems.filter((item) => item.answer).length
    if (application.status === 'completed') completed += 1

    const unanswered = scopedItems.filter((item) => !item.answer)
    if (unanswered.length > 0) {
      pendingGroups.push({
        application,
        items: unanswered.map((item) => ({
          applicationId: application.id,
          itemId: item.id,
          itemTitle: item.title,
        })),
      })
    }
  }

  return {
    itemProgress: { answered, total },
    applicationProgress: { completed, total: matching.length },
    pendingGroups,
  }
}
