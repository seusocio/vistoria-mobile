import { describe, expect, test } from 'bun:test'
import { create } from 'zustand'
import { createSessionSlice, type SessionState } from '../session.store'

/** A throwaway, purely in-memory store — no `persist`, no AsyncStorage. */
function freshStore() {
  return create<SessionState>()(createSessionSlice)
}

describe('session slice', () => {
  test('setSession replaces token, org, project and user together', () => {
    const store = freshStore()

    store.getState().setSession({
      token: 'tok_1',
      activeOrgId: 'org_1',
      activeProjectId: 'proj_1',
      user: { id: 'user_1' },
    })

    expect(store.getState()).toMatchObject({
      token: 'tok_1',
      activeOrgId: 'org_1',
      activeProjectId: 'proj_1',
      user: { id: 'user_1' },
    })
  })

  test('clearSession drops the token, scope and user without touching anything else', () => {
    const store = freshStore()
    store.getState().setSession({
      token: 'tok_1',
      activeOrgId: 'org_1',
      activeProjectId: 'proj_1',
      user: { id: 'user_1' },
    })

    store.getState().clearSession()

    expect(store.getState()).toMatchObject({
      token: null,
      activeOrgId: null,
      activeProjectId: null,
      user: null,
    })
  })
})
