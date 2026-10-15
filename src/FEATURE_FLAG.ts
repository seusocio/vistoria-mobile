export const FEATURE_FLAG = {
  /** on-device voice recording + Whisper transcription (iOS only) */
  voice: true,
  /** AI answer suggestions from the transcript (still mock) */
  suggestion: false,
  /** On-screen outbox/upload-queue inspector (pill under the sync bar). Debug only — turn off before shipping. */
  outboxDebugger: true,
} as const
