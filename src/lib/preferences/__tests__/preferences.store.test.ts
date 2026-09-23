import { describe, expect, test } from 'bun:test'
import { create } from 'zustand'
import { createPreferencesSlice, type PreferencesState } from '../preferences.store'

/** A throwaway, purely in-memory store — no `persist`, no AsyncStorage. */
function freshStore() {
  return create<PreferencesState>()(createPreferencesSlice)
}

describe('preferences slice', () => {
  test('starts on the detailed history layout', () => {
    expect(freshStore().getState().historyLayout).toBe('detailed')
  })

  test('toggle flips between the two layouts and back', () => {
    const store = freshStore()

    store.getState().toggleHistoryLayout()
    expect(store.getState().historyLayout).toBe('dense')

    store.getState().toggleHistoryLayout()
    expect(store.getState().historyLayout).toBe('detailed')
  })

  test('setHistoryLayout is idempotent', () => {
    const store = freshStore()

    store.getState().setHistoryLayout('dense')
    store.getState().setHistoryLayout('dense')

    expect(store.getState().historyLayout).toBe('dense')
  })
})
