import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'
import { useUploadStore } from './upload-store'

const BACKGROUND_UPLOAD_TASK = 'photo-upload-recovery'

let registrationStarted = false

TaskManager.defineTask(BACKGROUND_UPLOAD_TASK, async () => {
  try {
    await useUploadStore.getState().resumePending()
    return BackgroundTask.BackgroundTaskResult.Success
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

/**
 * Gives the pending-upload queue periodic chances to flush while the app is
 * backgrounded. Best-effort only: iOS/Android schedule this opportunistically
 * (15 min is the platform floor, not a guarantee) — the AppState-driven
 * `subscribeToUploadRecovery` foreground resume remains the fast path.
 */
export function registerBackgroundUploadTask() {
  if (registrationStarted) return
  registrationStarted = true
  void BackgroundTask.registerTaskAsync(BACKGROUND_UPLOAD_TASK, {
    minimumInterval: 15,
  }).catch(() => undefined)
}
