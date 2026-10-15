// The visit screen (Pencil VJeSH "Atividade" / c5JmB "Pendências"). Atividade is the
// visit's Notes feed (`features/note`); Pendências is the checklist list the legacy
// `application-fill` view renders, driven by the same container.
import { useCallback, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { ScrollViewContainer } from 'react-native-reorderable-list'
import Animated from 'react-native-reanimated'
import { PhotoViewer } from '@/components'
import { useNoteDrafts } from '@/features/note/shared/note-drafts.store'
import type { Note } from '@/features/note/shared/note.types'
import { useNotesFeed } from '@/features/note/shared/use-notes-feed'
import { usePullToRefresh } from '@/lib/api/use-pull-to-refresh'
import { colors, space } from '@/styles'
import type { ApplicationFillContainer } from '../application-fill/application-fill.container'
import { AddItemSheet } from '../application-fill/components/AddItemSheet'
import { ApplicationItemDrawer } from '../application-fill/components/ApplicationItemDrawer'
import { DeleteApplicationConfirm } from '../application-fill/components/DeleteApplicationConfirm'
import { EditApplicationSheet } from '../application-fill/components/EditApplicationSheet'
import { ActivityFeed } from './components/ActivityFeed'
import { NoteComposer } from './components/NoteComposer'
import { PendenciasTab } from './components/PendenciasTab'
import { VisitaGallery } from './components/VisitaGallery'
import { VisitaSheetHeader } from './components/VisitaSheetHeader'
import { VisitaTabs } from './components/VisitaTabs'
import { VisitaTopBar } from './components/VisitaTopBar'
import { useCollapsingHeader } from './use-collapsing-header'
import { useNoteComposer, type VisitaTab } from './use-note-composer'
import { useVisitaAttachments } from './use-visita-attachments'
import { confirmDeleteNote, confirmRemovePhoto, presentNoteMenu, runRegenerate } from './visita-prompts'

/** Within this many px of the bottom, the next page of notes is requested. */
const LOAD_MORE_THRESHOLD = 600

export interface ApplicationVisitaViewProps {
  c: ApplicationFillContainer
  /** Opens the continuous camera in `asNote` mode — the session becomes one Note. */
  onOpenNoteCamera: () => void
}

export function ApplicationVisitaView({ c, onOpenNoteCamera }: ApplicationVisitaViewProps) {
  const { refreshing, onRefresh } = usePullToRefresh()
  const [tab, setTab] = useState<VisitaTab>('atividade')
  const feed = useNotesFeed(c.application.id)
  const header = useCollapsingHeader()
  const { visiblePhotos, galleryPhotos, removePhoto, resolveNoteAttachments } = useVisitaAttachments(c)
  const composer = useNoteComposer(c, tab)
  const { startEdit } = composer

  const openNoteMenu = useCallback(
    (note: Note) => {
      // Not created yet — an edit or delete would be queued ahead of its create.
      if (useNoteDrafts.getState().drafts[note.id]) return
      const audio = resolveNoteAttachments(note).find((a) => a.attachment.mimeType?.startsWith('audio/'))
      const audioUri = audio?.uri
      presentNoteMenu({
        onEdit: () => {
          setTab('atividade')
          startEdit(note)
        },
        onRegenerate:
          audio && audioUri
            ? () => void runRegenerate(note, { uri: audioUri, attachmentId: audio.attachment.id })
            : undefined,
        onDelete: () => confirmDeleteNote(note, note.attachmentIds.length > 0),
      })
    },
    [resolveNoteAttachments, startEdit],
  )
  const openPhoto = useCallback((index: number) => c.onOpenPhoto(null, index), [c.onOpenPhoto])

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (tab !== 'atividade') return
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - LOAD_MORE_THRESHOLD) feed.fetchNextPage()
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollViewContainer
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: space.xl }}
        onScroll={header.onScroll}
        onMomentumScrollEnd={onScrollEnd}
        onScrollEndDrag={onScrollEnd}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Animated.View style={[s.banner, header.bannerStyle]} />

        <VisitaSheetHeader c={c} header={header} />

        <VisitaTabs header={header} tab={tab} onChange={setTab} photoCount={visiblePhotos.length} />

        <View style={s.tabContent}>
          {tab === 'fotos' ? (
            <VisitaGallery photos={galleryPhotos} reference={Boolean(c.application.gallerySourceApplicationId)} />
          ) : tab === 'atividade' ? (
            <ActivityFeed
              notes={feed.notes}
              isFetchingNextPage={feed.isFetchingNextPage}
              resolveNoteAttachments={resolveNoteAttachments}
              onOpenPhoto={openPhoto}
              onRetryAttachment={c.onRetryApplicationAttachment}
              onRemoveAttachment={removePhoto}
              onOpenMenu={openNoteMenu}
            />
          ) : (
            <PendenciasTab c={c} />
          )}
        </View>
      </ScrollViewContainer>

      <VisitaTopBar header={header} title={c.checklist.title} onBack={c.onBack} />

      <NoteComposer
        c={c}
        composer={composer}
        notesComposer={tab !== 'pendencias'}
        onOpenNoteCamera={onOpenNoteCamera}
      />

      <ApplicationItemDrawer c={c} />

      <PhotoViewer
        visible={c.viewer !== null}
        photos={c.viewerPhotos}
        initialIndex={c.viewer?.index ?? 0}
        onClose={c.onCloseViewer}
        onDelete={(attachmentId) => confirmRemovePhoto(() => c.onDeletePhotoFromViewer(attachmentId))}
      />

      <AddItemSheet c={c} />
      <EditApplicationSheet
        c={c}
        onDelete={() => {
          c.onCloseEditApplication()
          c.onDelete()
        }}
      />

      <DeleteApplicationConfirm c={c} />
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  scroll: { backgroundColor: colors.white },
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.ink.base,
  },
  tabContent: { zIndex: 0, backgroundColor: colors.white },
})
