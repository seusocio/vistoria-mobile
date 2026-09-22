/**
 * Eagerly registers every op in the app.
 *
 * The outbox persists ops by `type` and looks the definition back up when it
 * drains, which can happen before any screen has mounted — on a cold start
 * with a queue left over from the previous session, the drain runs from
 * `useOutboxLifecycle` at the root. Letting each feature's own screen import
 * register its ops would make that lookup depend on navigation state, so
 * `App.tsx` imports this module instead.
 */
import '@/features/application/shared/application.ops'
import '@/features/checklist/checklist-form/checklist-form.ops'
import '@/features/tag/shared/tag.ops'
