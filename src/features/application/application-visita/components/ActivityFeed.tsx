import { AnimatePresence } from 'moti'
import { useMemo } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import type { Note } from '@/features/note/shared/note.types'
import { colors, space, textStyles } from '@/styles'
import { groupNotesByDay } from '../visita-format'
import { NoteCard, type NoteAttachmentView } from './NoteCard'

export interface ActivityFeedProps {
  /** `undefined` while the first page loads. */
  notes: Note[] | undefined
  isFetchingNextPage: boolean
  resolveNoteAttachments: (note: Note) => NoteAttachmentView[]
  onOpenPhoto: (index: number) => void
  onRetryAttachment: (attachmentId: string) => void
  onRemoveAttachment: (attachmentId: string) => void
  onOpenMenu: (note: Note) => void
}

/** The Atividade tab: the visit's notes, newest first, under day headers. */
export function ActivityFeed({
  notes,
  isFetchingNextPage,
  resolveNoteAttachments,
  onOpenPhoto,
  onRetryAttachment,
  onRemoveAttachment,
  onOpenMenu,
}: ActivityFeedProps) {
  const feedDays = useMemo(() => groupNotesByDay(notes ?? []), [notes])

  return (
    <View>
      {notes === undefined ? (
        <ActivityIndicator style={s.feedSpinner} color={colors.gray[400]} />
      ) : notes.length === 0 ? (
        <View style={s.emptyFeed}>
          <Text style={s.emptyTitle}>Nenhuma nota ainda</Text>
          <Text style={s.emptyText}>Escreva, grave um áudio ou envie fotos pelo campo abaixo.</Text>
        </View>
      ) : (
        feedDays.map((day) => (
          <View key={day.label}>
            <Text style={s.dayHeader}>{day.label}</Text>
            <AnimatePresence initial={false}>
              {day.notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  attachments={resolveNoteAttachments(note)}
                  onOpenPhoto={onOpenPhoto}
                  onRetryAttachment={onRetryAttachment}
                  onRemoveAttachment={onRemoveAttachment}
                  onOpenMenu={onOpenMenu}
                />
              ))}
            </AnimatePresence>
          </View>
        ))
      )}
      {isFetchingNextPage ? <ActivityIndicator style={s.feedSpinner} color={colors.gray[400]} /> : null}
    </View>
  )
}

const s = StyleSheet.create({
  dayHeader: {
    ...textStyles.sectionTitle,
    paddingHorizontal: space.lg + 4,
    paddingTop: space.lg,
    paddingBottom: space.xs,
    backgroundColor: colors.white,
  },
  feedSpinner: { paddingVertical: space.xl },
  emptyFeed: {
    alignItems: 'center',
    paddingHorizontal: space.xxl,
    paddingVertical: space.xxl,
    gap: space.xs,
  },
  emptyTitle: { ...textStyles.bodyStrong },
  emptyText: { ...textStyles.body, textAlign: 'center' },
})
