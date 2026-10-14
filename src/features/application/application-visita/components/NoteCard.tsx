import { AnimatePresence, MotiView } from 'moti'
import { memo } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { PhotoThumb } from '@/components'
import { Icon } from '@/components/Icon'
import type { Attachment } from '@/features/application/shared/application.types'
import { acceptTranscriptionCandidate } from '@/features/note/shared/note.actions'
import type { Note } from '@/features/note/shared/note.types'
import { useTranscriptions } from '@/features/note/shared/transcription.store'
import { colors, fontFamily, space, textStyles } from '@/styles'
import { NoteAudioPlayer } from './NoteAudioPlayer'

export interface NoteAttachmentView {
  attachment: Attachment
  uri: string | undefined
  progress: number
  /** Index into the visit gallery the PhotoViewer opens on; null for audio. */
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
  const regenerating = useTranscriptions((state) => Boolean(state.regenerating[note.id]))
  const candidate = useTranscriptions((state) => state.candidates[note.id])
  const clearCandidate = useTranscriptions((state) => state.clearCandidate)
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

        {regenerating ? (
          <View style={styles.transcribing}>
            <ActivityIndicator size="small" color={colors.gray[400]} />
            <Text style={styles.noTranscript}>Gerando nova transcrição…</Text>
          </View>
        ) : null}

        {candidate ? (
          <MotiView
            style={styles.candidate}
            from={{ opacity: 0, translateY: -6 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 200 }}
          >
            <Text style={styles.candidateLabel}>Nova transcrição</Text>
            <Text style={styles.transcript}>{candidate}</Text>
            <View style={styles.candidateActions}>
              <Pressable
                style={({ pressed }) => [styles.candidateButton, pressed && { opacity: 0.7 }]}
                onPress={() => clearCandidate(note.id)}
              >
                <Text style={styles.candidateButtonText}>Manter atual</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.candidateButton, styles.candidatePrimary, pressed && { opacity: 0.85 }]}
                onPress={() => acceptTranscriptionCandidate(note)}
              >
                <Text style={[styles.candidateButtonText, { color: colors.white }]}>Usar nova</Text>
              </Pressable>
            </View>
          </MotiView>
        ) : null}

        {images.length > 0 ? (
          // Not PhotoGalleryRow: a virtualized list can't animate a tile out,
          // and a note holds a handful of photos at most.
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.images}>
            <AnimatePresence initial={false}>
              {images.map((image) => (
                <MotiView
                  key={image.attachment.id}
                  from={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'timing', duration: 200 }}
                >
                  <PhotoThumb
                    uri={image.uri}
                    uploading={image.attachment.uploadStatus === 'pending'}
                    failed={image.attachment.uploadStatus === 'failed'}
                    progress={image.progress}
                    onPress={() => {
                      if (image.viewerIndex !== null) onOpenPhoto(image.viewerIndex)
                    }}
                    onRetry={() => onRetryAttachment(image.attachment.id)}
                    onRemove={() => onRemoveAttachment(image.attachment.id)}
                  />
                </MotiView>
              ))}
            </AnimatePresence>
          </ScrollView>
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
  candidate: {
    gap: 6,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.blue.tint,
    backgroundColor: colors.gray[100],
  },
  candidateLabel: { ...textStyles.metaLabel, color: colors.blue.base },
  candidateActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: 2 },
  candidateButton: {
    height: 30,
    paddingHorizontal: space.md,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  candidatePrimary: { backgroundColor: colors.blue.base, borderColor: colors.blue.base },
  candidateButtonText: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.ink.base },
  images: { gap: space.sm },
  transcribing: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noTranscript: {
    ...textStyles.body,
    fontStyle: 'italic',
    color: colors.gray[400],
  },
})
