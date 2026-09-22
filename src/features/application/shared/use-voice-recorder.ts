import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio'
import { useCallback } from 'react'

export interface VoiceRecorder {
  /** Requests permission, configures the session and starts capturing. */
  startRecording: () => Promise<void>
  /** Stops capturing and returns the recorded file uri, or null. */
  stopRecording: () => Promise<string | null>
}

export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)

  const startRecording = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync()
    if (!permission.granted) {
      throw new Error('Permissão de microfone negada.')
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
    await recorder.prepareToRecordAsync()
    recorder.record()
  }, [recorder])

  const stopRecording = useCallback(async () => {
    await recorder.stop()
    await setAudioModeAsync({ allowsRecording: false })
    return recorder.uri
  }, [recorder])

  return { startRecording, stopRecording }
}
