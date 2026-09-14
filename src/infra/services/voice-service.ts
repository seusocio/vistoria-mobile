import { Application, Checklist } from '@/infra/domain/entities'

/**
 * Mock implementation of the recording/transcription/suggestion pipeline.
 * There is no real speech backend yet (frontend-only phase) - swap these
 * functions for real API calls once one exists, keeping the same shape so
 * ApplicationFill doesn't need to change.
 */

const CANNED_TRANSCRIPT =
  'Vistoria realizada com o cliente presente. A pintura da sala está bem conservada e a esquadria do quarto precisa de ajuste. A fechadura da porta principal está funcionando normalmente.'

export async function simulateStopRecording(): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 1400))
  return CANNED_TRANSCRIPT
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
