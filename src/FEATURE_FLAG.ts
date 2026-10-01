export const FEATURE_FLAG = {
  /** on-device voice recording + Whisper transcription (iOS only) */
  voice: true,
  /** AI answer suggestions from the transcript (still mock) */
  suggestion: false,
} as const
