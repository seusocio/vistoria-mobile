import { useSessionStore } from './session.store'

/**
 * The org/project every REST write is scoped to, read at the moment the write
 * is sent. `owner` only prefixes the error, so a stuck op's `lastError` says
 * which feature asked.
 */
export function requireActiveProject(owner: string): { orgId: string; projectId: string } {
  const { activeOrgId, activeProjectId } = useSessionStore.getState()
  if (!activeOrgId || !activeProjectId) {
    throw new Error(`${owner}: no active organization/project session`)
  }
  return { orgId: activeOrgId, projectId: activeProjectId }
}
