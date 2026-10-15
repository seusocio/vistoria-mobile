import { ActionSheetIOS, Alert, Platform } from 'react-native'
import { deleteNote, regenerateTranscription } from '@/features/note/shared/note.actions'
import type { Note } from '@/features/note/shared/note.types'

interface MenuOption {
  label: string
  run: () => void
  destructive?: boolean
}

/** Native pickers, same pattern as application-completion-picker: ActionSheetIOS on iOS, Alert elsewhere. */
function presentOptions(alertTitle: string, options: MenuOption[]) {
  if (Platform.OS === 'ios') {
    const destructiveIndex = options.findIndex((o) => o.destructive)
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...options.map((o) => o.label), 'Cancelar'],
        destructiveButtonIndex: destructiveIndex === -1 ? undefined : destructiveIndex,
        cancelButtonIndex: options.length,
        userInterfaceStyle: 'light',
      },
      (index) => options[index]?.run(),
    )
    return
  }
  Alert.alert(alertTitle, undefined, [
    ...options.map((o) => ({
      text: o.label,
      style: o.destructive ? ('destructive' as const) : undefined,
      onPress: o.run,
    })),
    { text: 'Cancelar', style: 'cancel' as const },
  ])
}

export function presentAttachPicker({ onCamera, onLibrary }: { onCamera: () => void; onLibrary: () => void }) {
  presentOptions('Publicar na atividade', [
    { label: 'Câmera', run: onCamera },
    { label: 'Galeria de fotos', run: onLibrary },
  ])
}

export function presentNoteMenu({
  onEdit,
  onRegenerate,
  onDelete,
}: {
  onEdit: () => void
  /** Only for notes with audio. */
  onRegenerate?: () => void
  onDelete: () => void
}) {
  presentOptions('Nota', [
    { label: 'Editar texto', run: onEdit },
    ...(onRegenerate ? [{ label: 'Gerar transcrição de novo', run: onRegenerate }] : []),
    { label: 'Excluir nota', run: onDelete, destructive: true },
  ])
}

export async function runRegenerate(note: Note, audio: { uri: string; attachmentId: string }) {
  try {
    const outcome = await regenerateTranscription(note, audio)
    if (outcome === 'same') Alert.alert('Transcrição', 'A nova transcrição saiu igual à atual.')
    if (outcome === 'empty') Alert.alert('Transcrição', 'Não foi possível reconhecer fala neste áudio.')
  } catch (error) {
    Alert.alert('Transcrição', error instanceof Error ? error.message : 'Não foi possível transcrever o áudio.')
  }
}

export function confirmDeleteNote(note: Note, hasAttachments: boolean) {
  Alert.alert(
    'Excluir nota?',
    hasAttachments ? 'Fotos e áudios usados só nesta nota também serão excluídos.' : undefined,
    [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => deleteNote(note),
      },
    ],
  )
}

/**
 * Deleting a photo always asks first — from the gallery grid, from a note in
 * the feed, or from the viewer. Removing it from the gallery also unlinks it
 * from every note (the server does that), so the message says so. The undo
 * toast still follows as a second chance.
 */
export function confirmRemovePhoto(onConfirm: () => void) {
  Alert.alert('Excluir foto?', 'A foto sai da galeria da visita e de todas as notas em que aparece.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: onConfirm },
  ])
}
