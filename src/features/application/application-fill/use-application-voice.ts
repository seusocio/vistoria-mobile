import { useEffect, useState } from 'react'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import type { VoiceState } from '@/components/VoiceCard'
import { useVoiceRecorder } from '@/features/application/shared/use-voice-recorder'
import type { Application } from '@/features/application/shared/application.types'
import type { ApplicationItemPatch } from '@/features/application/shared/application.utils'
import type { Checklist } from '@/features/checklist/shared/checklist.types'
import { postVoiceNote } from '@/features/note/shared/note.actions'
import { generateSuggestions, prepareTranscriber } from '@/lib/voice/voice-service'

export interface UseApplicationVoiceProps {
  application: Application
  checklist: Checklist
  editItem: (itemId: string, patch: ApplicationItemPatch) => void
  setApplicationError: (message: string | null) => void
}

export function useApplicationVoice({ application, checklist, editItem, setApplicationError }: UseApplicationVoiceProps) {
  const { startRecording, stopRecording } = useVoiceRecorder()
  /**
   * The last recording's transcription, this session only — what the legacy
   * VoiceCard shows. The durable copy is the Note it was posted as.
   */
  const [lastVoiceTranscript, setLastVoiceTranscript] = useState<string | null>(null)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false)

  useEffect(() => {
    if (!FEATURE_FLAG.voice) return
    setVoiceState(lastVoiceTranscript ? 'ready' : 'idle')
  }, [lastVoiceTranscript])
  useEffect(() => {
    // Warm up the WhisperKit model (downloads on first run) so stopping a
    // recording doesn't stall while the model loads. Errors surface later on
    // the actual transcription attempt.
    if (FEATURE_FLAG.voice) void prepareTranscriber()
  }, [])

  // --- voice / suggestions (feature-flagged off today) ------------------
  async function handleStartRecording() {
    if (!FEATURE_FLAG.voice) return
    try {
      await startRecording()
      setVoiceState('recording')
    } catch (error) {
      setApplicationError(
        error instanceof Error ? error.message : 'Não foi possível iniciar a gravação',
      )
    }
  }

  async function handleStopRecording() {
    if (!FEATURE_FLAG.voice) return
    setVoiceState('processing')
    try {
      const uri = await stopRecording()
      if (!uri) throw new Error('Gravação vazia')
      // Resolves as soon as the note is queued — the composer is free again
      // while transcription fills the note's text in the background.
      await postVoiceNote({
        applicationId: application.id,
        recordingUri: uri,
        position: application.attachments.length,
        onTranscribed: (text) => {
          if (text) {
            setLastVoiceTranscript(text)
            setVoiceState((current) => (current === 'idle' ? 'ready' : current))
          }
        },
      })
      setVoiceState(lastVoiceTranscript ? 'ready' : 'idle')
    } catch (error) {
      setApplicationError(
        error instanceof Error ? error.message : 'Não foi possível salvar a gravação',
      )
      setVoiceState(lastVoiceTranscript ? 'ready' : 'idle')
    }
  }

  async function handleGenerateSuggestions() {
    if (!FEATURE_FLAG.suggestion) return
    setGeneratingSuggestions(true)
    try {
      const suggestions = await generateSuggestions(checklist, application)
      for (const suggestion of suggestions) {
        editItem(suggestion.itemId, {
          answer: suggestion.answer,
          note: suggestion.note ?? '',
          suggested: true,
          suggestionSource: 'transcript' as const,
        })
      }
    } finally {
      setGeneratingSuggestions(false)
    }
  }

  return {
    voiceState,
    lastVoiceTranscript,
    generatingSuggestions,
    onStartRecording: handleStartRecording,
    onStopRecording: handleStopRecording,
    onGenerateSuggestions: handleGenerateSuggestions,
  }
}
