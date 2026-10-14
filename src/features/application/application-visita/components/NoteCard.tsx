import { MotiView } from 'moti'
import { memo } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { PhotoGalleryRow } from '@/components'
import { Icon } from '@/components/Icon'
import type { Attachment } from '@/features/application/shared/application.types'
import type { Note } from '@/features/note/shared/note.types'
import { useTranscriptions } from '@/features/note/shared/transcription.store'
import { colors, fontFamily, space, textStyles } from '@/styles'
import { NoteAudioPlayer } from './NoteAudioPlayer'

export interface NoteAttachmentView {
  attachment: Attachment
  uri: string | undefined
  progress: number
  /** Index into the visit gallery the PhotoViewer opens on; null for audio, or a photo the app only remembers (mid-refresh). */
  viewerIndex: number | null
}

interface NoteCardProps {
  note: Note
  /** Resolved in `note.attachmentIds` order; ids the app doesn't know (yet) are simply skipped. */
  attachments: NoteAttachmentView[]
  onOpenPhoto: (viewerIndex: number) => void
  onRetryAttachment: (attachmentId: string) => void
  /** Asks for confirmation before anything is removed — see `confirmRemovePhoto`. */
  onRemoveAttachment: (attachmentId: string) => void
  onOpenMenu: (note: Note) => void
}

const fmtTime = (iso: string) => {
  const date = new Date(iso)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export const NoteCard = memo(function NoteCard({
  note,
  attachments,
  onOpenPhoto,
  onRetryAttachment,
  onRemoveAttachment,
  onOpenMenu,
}: NoteCardProps) {
  const transcribing = useTranscriptions((state) => Boolean(state.pending[note.id]))
  const audios = attachments.filter((a) => a.attachment.mimeType?.startsWith('audio/'))
  const images = attachments.filter((a) => !a.attachment.mimeType?.startsWith('audio/'))

  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: 'timing', duration: 220 }}
    >
      <Pressable style={styles.card} onLongPress={() => onOpenMenu(note)} delayLongPress={350}>
        <View style={styles.header}>
          <Text style={styles.time}>{fmtTime(note.createdAt)}</Text>
          {audios.length > 0 ? <Text style={styles.kind}>· Áudio</Text> : null}
          <Pressable
            style={styles.menu}
            hitSlop={12}
            onPress={() => onOpenMenu(note)}
            accessibilityLabel="Opções da nota"
          >
            <Icon name="more-vertical" size={16} color={colors.gray[400]} />
          </Pressable>
        </View>

        {audios.map((audio) => (
          <NoteAudioPlayer
            key={audio.attachment.id}
            uri={audio.uri}
            uploading={audio.attachment.uploadStatus === 'pending'}
          />
        ))}

        {note.text ? (
          <MotiView
            key="text"
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: 220 }}
          >
            <Text style={audios.length > 0 ? styles.transcript : styles.text}>{note.text}</Text>
          </MotiView>
        ) : transcribing ? (
          <View style={styles.transcribing}>
            <ActivityIndicator size="small" color={colors.gray[400]} />
            <Text style={styles.noTranscript}>Transcrevendo…</Text>
          </View>
        ) : audios.length > 0 ? (
          <Text style={styles.noTranscript}>Sem transcrição</Text>
        ) : null}

        {images.length > 0 ? (
          <PhotoGalleryRow
            photos={images.map((image) => ({
              id: image.attachment.id,
              uri: image.uri,
              uploading: image.attachment.uploadStatus === 'pending',
              failed: image.attachment.uploadStatus === 'failed',
              progress: image.progress,
              onPress: () => {
                if (image.viewerIndex !== null) onOpenPhoto(image.viewerIndex)
              },
              onRetry: () => onRetryAttachment(image.attachment.id),
              onRemove: () => onRemoveAttachment(image.attachment.id),
            }))}
          />
        ) : null}
      </Pressable>
    </MotiView>
  )
})

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: space.lg + 4,
    paddingVertical: space.md,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { ...textStyles.metaLabel, color: colors.gray[600] },
  kind: { ...textStyles.metaLabel },
  menu: { marginLeft: 'auto' },
  text: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink.base,
  },
  transcript: { ...textStyles.body, color: colors.ink.base, lineHeight: 19 },
  transcribing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noTranscript: {
    ...textStyles.body,
    fontStyle: 'italic',
    color: colors.gray[400],
  },
})
