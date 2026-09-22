import { Platform } from 'react-native'
import { Application } from '@/features/application/shared/application.types'
import { Checklist } from '@/features/checklist/shared/checklist.types'

let transcriberLoad: Promise<boolean> | null = null

/**
 * Loads the on-device WhisperKit model once. iOS-only; resolves false elsewhere.
 * whisper-kit-expo is imported dynamically so the native module is never
 * touched on Android/web, where it does not exist. A failed load (e.g. the
 * model could not be downloaded) is NOT cached, so a later call retries.
 */
export async function prepareTranscriber(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false
  if (transcriberLoad) return transcriberLoad

  transcriberLoad = (async () => {
    try {
      // Platform-specific: the package has no native module in Expo Go or non-iOS runtimes.
      const { loadTranscriber } = await import('whisper-kit-expo')
      return await loadTranscriber()
    } catch {
      return false
    }
  })()

  const ready = await transcriberLoad
  if (!ready) transcriberLoad = null
  return ready
}

/** Transcribes a recorded audio file (wav/mp3/m4a/flac) on-device. iOS-only. */
export async function transcribeAudio(uri: string): Promise<string> {
  if (Platform.OS !== 'ios') {
    throw new Error('A transcrição por voz está disponível apenas no iOS.')
  }
  const ready = await prepareTranscriber()
  if (!ready) {
    throw new Error(
      'Não foi possível carregar o modelo de transcrição. Verifique a conexão e tente novamente.',
    )
  }
  // Platform-specific: iOS-only native module; static import breaks Android/web.
  const { transcribe } = await import('whisper-kit-expo')
  return transcribe(uri)
}

export interface VoiceSuggestion {
  itemId: string
  answer: string
  note?: string
}

export async function generateSuggestions(
  checklist: Checklist,
  application: Application,
): Promise<VoiceSuggestion[]> {
  await new Promise((resolve) => setTimeout(resolve, 900))

  const positive = checklist.options.find(
    (option) => option.semantic === 'positivo',
  )
  const negative = checklist.options.find(
    (option) => option.semantic === 'negativo',
  )
  const neutral = checklist.options.find(
    (option) => option.semantic === 'neutro',
  )
  const fallback = checklist.options[0]

  const eligibleItems = application.items.filter(
    (item) => !item.deletedAt && !item.suggested,
  )

  return eligibleItems.map((item, index) => {
    const cycle = index % 3
    if (cycle === 1 && negative) {
      return {
        itemId: item.id,
        answer: negative.label,
        note: `Foi identificado um ponto de atenção em "${item.title}" durante a vistoria por voz.`,
      }
    }
    if (cycle === 2 && neutral) {
      return { itemId: item.id, answer: neutral.label }
    }
    return { itemId: item.id, answer: positive?.label ?? fallback?.label ?? '' }
  })
}
