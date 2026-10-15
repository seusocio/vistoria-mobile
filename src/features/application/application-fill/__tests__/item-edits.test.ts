import { describe, expect, test } from 'bun:test'
import type { Application, ApplicationItem } from '@/features/application/shared/application.types'
import {
  applyPendingEdits,
  mergePendingPatch,
  selectStatusEdits,
  toggleCompleteEdits,
  toggleGroupCompleteEdits,
} from '../item-edits'

const SIM = 'Sim'

function item(id: string, overrides: Partial<ApplicationItem> = {}): ApplicationItem {
  return {
    id,
    position: 0,
    checklistItemId: null,
    title: id,
    description: '',
    answer: '',
    answeredAt: null,
    note: '',
    quantity: null,
    attachments: [],
    tagsIds: [],
    suggested: false,
    suggestionSource: null,
    workflowStatus: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function application(items: ApplicationItem[]): Application {
  return {
    id: 'app_1',
    checklistId: 'cl_1',
    tagsIds: [],
    date: '2026-10-01',
    status: 'draft',
    items,
    attachments: [],
    gallerySourceApplicationId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    completedAt: null,
    deletedAt: null,
  }
}

/** Runs edits through the same merge + apply path the screen uses, and returns the item as shown. */
function show(items: ApplicationItem[], edits: ReturnType<typeof toggleCompleteEdits>, at = '2026-10-02T00:00:00.000Z') {
  let pending = {}
  for (const [itemId, patch] of edits) pending = mergePendingPatch(pending, itemId, patch, at)
  return applyPendingEdits(application(items), pending, []).items
}

describe('checking an item off', () => {
  test('marks it with the positive answer and drops any suggestion flag', () => {
    const items = [item('a', { suggested: true, suggestionSource: 'previous_application' })]
    const [shown] = show(items, toggleCompleteEdits(items, 'a', SIM))
    expect(shown.answer).toBe(SIM)
    expect(shown.suggested).toBe(false)
    expect(shown.suggestionSource).toBeNull()
    expect(shown.answeredAt).toBe('2026-10-02T00:00:00.000Z')
  })

  test('clears a workflow status ("em revisão", "negado") when completing', () => {
    const items = [item('a', { workflowStatus: 'in_review' })]
    const [shown] = show(items, toggleCompleteEdits(items, 'a', SIM))
    expect(shown.answer).toBe(SIM)
    expect(shown.workflowStatus).toBeNull()
  })

  test('a second tap unchecks it', () => {
    const items = [item('a', { answer: SIM, answeredAt: '2026-10-01T00:00:00.000Z' })]
    const [shown] = show(items, toggleCompleteEdits(items, 'a', SIM))
    expect(shown.answer).toBe('')
    expect(shown.answeredAt).toBeNull()
  })

  test('does nothing when the checklist has no positive option', () => {
    expect(toggleCompleteEdits([item('a')], 'a', undefined)).toEqual([])
  })
})

describe("checking a whole group off from its header", () => {
  test('answers every item and clears their workflow statuses', () => {
    const items = [item('a'), item('b', { workflowStatus: 'denied' })]
    const shown = show(items, toggleGroupCompleteEdits(items, ['a', 'b'], true, SIM))
    expect(shown.map((i) => i.answer)).toEqual([SIM, SIM])
    expect(shown[1].workflowStatus).toBeNull()
  })

  test('unchecking clears every answer but keeps workflow statuses', () => {
    const items = [item('a', { answer: SIM }), item('b', { answer: SIM, workflowStatus: 'in_progress' })]
    const shown = show(items, toggleGroupCompleteEdits(items, ['a', 'b'], false, SIM))
    expect(shown.map((i) => i.answer)).toEqual(['', ''])
    expect(shown[1].workflowStatus).toBe('in_progress')
  })
})

describe("the drawer's status picker", () => {
  test('a workflow status is set without touching the answer', () => {
    const items = [item('a', { answer: SIM })]
    const [shown] = show(items, selectStatusEdits(items, 'a', 'in_review', SIM))
    expect(shown.workflowStatus).toBe('in_review')
    expect(shown.answer).toBe(SIM)
  })

  test('"completed" answers positively and clears the workflow status', () => {
    const items = [item('a', { workflowStatus: 'denied' })]
    const [shown] = show(items, selectStatusEdits(items, 'a', 'completed', SIM))
    expect(shown.answer).toBe(SIM)
    expect(shown.workflowStatus).toBeNull()
  })

  test('"idle" clears a positive answer', () => {
    const items = [item('a', { answer: SIM })]
    const [shown] = show(items, selectStatusEdits(items, 'a', 'idle', SIM))
    expect(shown.answer).toBe('')
  })

  test('picking the status the item already has changes nothing', () => {
    const items = [item('a', { answer: SIM })]
    expect(selectStatusEdits(items, 'a', 'completed', SIM)).toEqual([])
  })
})

describe('buffered edits', () => {
  test('several edits to one item merge into one patch, stamped with the last edit', () => {
    let pending = mergePendingPatch({}, 'a', { answer: SIM }, '2026-10-02T10:00:00.000Z')
    pending = mergePendingPatch(pending, 'a', { note: 'trinca no reboco' }, '2026-10-02T10:05:00.000Z')
    expect(pending).toEqual({
      a: { patch: { answer: SIM, note: 'trinca no reboco' }, updatedAt: '2026-10-02T10:05:00.000Z' },
    })
  })

  test('edits show on top of the server copy, with ad-hoc items appended', () => {
    const base = application([item('a'), item('b')])
    const pending = mergePendingPatch({}, 'b', { quantity: 3 }, '2026-10-02T00:00:00.000Z')
    const shown = applyPendingEdits(base, pending, [item('extra')])
    expect(shown.items.map((i) => i.id)).toEqual(['a', 'b', 'extra'])
    expect(shown.items[1].quantity).toBe(3)
    expect(shown.items[0]).toBe(base.items[0])
  })

  test('with nothing buffered the server copy is shown as-is', () => {
    const base = application([item('a')])
    expect(applyPendingEdits(base, {}, [])).toBe(base)
  })
})
