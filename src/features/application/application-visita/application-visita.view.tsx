// The visit screen (Pencil VJeSH "Atividade" / c5JmB "Pendências"). Atividade is the
// visit's Notes feed (`features/note`); Pendências is the checklist list the legacy
// `application-fill` view renders, driven by the same container.
import { BottomSheetView } from '@gorhom/bottom-sheet'
import { AnimatePresence, MotiView } from 'moti'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { ScrollViewContainer } from 'react-native-reorderable-list'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import {
  AppBottomSheet,
  Badge,
  ConfirmBottomSheet,
  Form,
  TagChipList,
  ItemDrawer,
  PhotoViewer,
  ProgressBar,
} from '@/components'
import { Icon } from '@/components/Icon'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import type { ApplicationDerivedState } from '@/features/application/shared/application.utils'
import { isVisibleImage } from '@/features/application/shared/application.utils'
import { deleteNote, editNoteText, postNote, regenerateTranscription } from '@/features/note/shared/note.actions'
import type { Note } from '@/features/note/shared/note.types'
import { useNotesFeed } from '@/features/note/shared/use-notes-feed'
import { pickPhotos } from '@/lib/convex/photo-picker'
import { useLocalUploadUris } from '@/lib/uploads/upload-store'
import { colors, fontFamily, radius, space, textStyles } from '@/styles'
import { resolvePreviewUri } from '../shared/attachment-preview'
import { useAttachmentVisibility } from '../shared/attachment-visibility'
import type { Attachment } from '../shared/application.types'
import { useAttachPhotos } from '../shared/use-attach-photos'
import { presentApplicationCompletionPicker } from '../application-fill/application-completion-picker'
import { styles as fillStyles } from '../application-fill/application-fill.styles'
import type { useApplicationFillContainer } from '../application-fill/application-fill.container'
import { ApplicationItemGroupSection } from '../application-fill/components/ApplicationItemGroupSection'
import { NoteCard, type NoteAttachmentView } from './components/NoteCard'
import { type GalleryPhoto, VisitaGallery } from './components/VisitaGallery'

type FillContainer = ReturnType<typeof useApplicationFillContainer>

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}
const DERIVED_STATE_LABEL: Record<ApplicationDerivedState, string> = {
  not_started: 'Não iniciada',
  in_progress: 'Executando',
  completed: 'Completa',
}

/** "Hoje" / "Ontem" / dd/mm/yyyy, from a note's `createdAt` in local time. */
function dayLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOf(today) - startOf(date)) / 86_400_000)
  if (diffDays === 0) return 'Hoje'
  if (diffDays === 1) return 'Ontem'
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

function initials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? 'V').slice(0, 2)).toUpperCase()
}

/* glyphs missing from the icon registry */
function Glyph({ name, size = 16, color }: { name: 'arrow-left' | 'image'; size?: number; color: string }) {
  const p = {
    stroke: color,
    strokeWidth: 2,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'arrow-left' && <Path d="M19 12H5M12 19l-7-7 7-7" {...p} />}
      {name === 'image' && (
        <Path
          d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 16l5-5 4 4 3-3 4 4M15 9h.01"
          {...p}
        />
      )}
    </Svg>
  )
}

function SendGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" fill={colors.white} />
    </Svg>
  )
}

/** Native pickers, same pattern as application-completion-picker. */
function presentAttachPicker({ onCamera, onLibrary }: { onCamera: () => void; onLibrary: () => void }) {
  const options = [
    { label: 'Câmera', run: onCamera },
    { label: 'Galeria de fotos', run: onLibrary },
  ]
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...options.map((o) => o.label), 'Cancelar'],
        cancelButtonIndex: options.length,
        userInterfaceStyle: 'light',
      },
      (index) => options[index]?.run(),
    )
    return
  }
  Alert.alert('Publicar na atividade', undefined, [
    ...options.map((o) => ({ text: o.label, onPress: o.run })),
    { text: 'Cancelar', style: 'cancel' as const },
  ])
}

function presentNoteMenu({
  onEdit,
  onRegenerate,
  onDelete,
}: {
  onEdit: () => void
  /** Only for notes with audio. */
  onRegenerate?: () => void
  onDelete: () => void
}) {
  const options = [
    { label: 'Editar texto', run: onEdit },
    ...(onRegenerate ? [{ label: 'Gerar transcrição de novo', run: onRegenerate }] : []),
    { label: 'Excluir nota', run: onDelete, destructive: true },
  ]
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...options.map((o) => o.label), 'Cancelar'],
        destructiveButtonIndex: options.length - 1,
        cancelButtonIndex: options.length,
        userInterfaceStyle: 'light',
      },
      (index) => options[index]?.run(),
    )
    return
  }
  Alert.alert('Nota', undefined, [
    ...options.map((o) => ({
      text: o.label,
      style: o.destructive ? ('destructive' as const) : undefined,
      onPress: o.run,
    })),
    { text: 'Cancelar', style: 'cancel' as const },
  ])
}

async function runRegenerate(note: Note, audio: { uri: string; attachmentId: string }) {
  try {
    const outcome = await regenerateTranscription(note, audio)
    if (outcome === 'same') Alert.alert('Transcrição', 'A nova transcrição saiu igual à atual.')
    if (outcome === 'empty') Alert.alert('Transcrição', 'Não foi possível reconhecer fala neste áudio.')
  } catch (error) {
    Alert.alert('Transcrição', error instanceof Error ? error.message : 'Não foi possível transcrever o áudio.')
  }
}

function confirmDeleteNote(note: Note, hasAttachments: boolean) {
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

/** Within this many px of the bottom, the next page of notes is requested. */
const LOAD_MORE_THRESHOLD = 600

export interface ApplicationVisitaViewProps {
  c: FillContainer
  /** Opens the continuous camera in `asNote` mode — the session becomes one Note. */
  onOpenNoteCamera: () => void
}

const TABS = ['atividade', 'fotos', 'pendencias'] as const
type Tab = (typeof TABS)[number]

/**
 * Deleting a photo always asks first — from the gallery grid, from a note in
 * the feed, or from the viewer. Removing it from the gallery also unlinks it
 * from every note (the server does that), so the message says so. The undo
 * toast still follows as a second chance.
 */
function confirmRemovePhoto(onConfirm: () => void) {
  Alert.alert('Excluir foto?', 'A foto sai da galeria da visita e de todas as notas em que aparece.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: onConfirm },
  ])
}

export function ApplicationVisitaView({ c, onOpenNoteCamera }: ApplicationVisitaViewProps) {
  const insets = useSafeAreaInsets()
  const localUris = useLocalUploadUris()
  const hiddenIds = useAttachmentVisibility((state) => state.hiddenIds)
  const { beginAttachment, commitAsset } = useAttachPhotos()
  const [tab, setTab] = useState<Tab>('atividade')
  const [draft, setDraft] = useState('')
  // The keyboard covers the home-indicator area, so its safe-area padding only applies while it's closed.
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setKeyboardOpen(true),
    )
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboardOpen(false),
    )
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  /** Set while the composer edits an existing note's text instead of posting a new one (WhatsApp-style edit). */
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const feed = useNotesFeed(c.application.id)

  // Twitter-style header: everything is driven by one scroll offset on the UI thread.
  const barHeight = insets.top + TOP_BAR
  const bannerHeight = barHeight + BANNER_EXTRA
  const scrollY = useSharedValue(0)
  const tabsY = useSharedValue(Number.MAX_SAFE_INTEGER)
  const nameY = useSharedValue(Number.MAX_SAFE_INTEGER)
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y
  })
  // Pull-down: grow the banner from its top edge so the bounce never reveals the
  // white scroll background. Scroll-up: slight parallax under the white sheet.
  const bannerStyle = useAnimatedStyle(() => {
    const y = scrollY.value
    if (y < 0) return { transform: [{ translateY: y }], height: bannerHeight - y }
    return { transform: [{ translateY: y * 0.5 }], height: bannerHeight }
  })
  // Bar stays transparent over the banner and turns solid once the banner is gone.
  const barBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [bannerHeight - barHeight - OVERLAP - 1, bannerHeight - barHeight - OVERLAP],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }))
  // Name fades into the bar once the in-page name has scrolled under it.
  const barNameStyle = useAnimatedStyle(() => {
    const start = nameY.value - barHeight
    return {
      opacity: interpolate(scrollY.value, [start, start + 24], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(scrollY.value, [start, start + 24], [8, 0], Extrapolation.CLAMP),
        },
      ],
    }
  })
  const avatarStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(scrollY.value, [0, 60], [1, 0.72], Extrapolation.CLAMP),
      },
    ],
  }))
  // Manual sticky: pins the tabs right under the top bar (stickyHeaderIndices can only pin at y=0).
  const tabsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, scrollY.value - (tabsY.value - barHeight)) }],
  }))

  const renderEditApplicationFooter = useSheetFooterActions({
    confirmLabel: 'Salvar',
    onConfirm: c.onSaveApplication,
  })
  const renderAddItemFooter = useSheetFooterActions({
    confirmLabel: 'Adicionar',
    onConfirm: c.onSaveNewItem,
  })

  const app = c.application
  const visitAt = app.date || app.createdAt
  // Same list (and indices) the PhotoViewer opens on — `isVisibleImage` is shared with the container.
  const visiblePhotos = useMemo(
    () => app.attachments.filter((a) => isVisibleImage(a, hiddenIds)),
    [app.attachments, hiddenIds],
  )
  /**
   * Attachments this screen has already seen. When an attachment's op drains,
   * the overlay drops it a moment before `refreshApplicationCache` brings the
   * server's copy back — without this memory a note's photo/audio blinks out
   * and pops back in that gap.
   */
  const seenAttachmentsRef = useRef(new Map<string, Attachment>())
  const attachmentsById = useMemo(() => {
    const map = new Map<string, Attachment>()
    for (const a of app.attachments) if (!a.deletedAt && !hiddenIds[a.id]) map.set(a.id, a)
    for (const item of app.items) for (const a of item.attachments) if (!a.deletedAt) map.set(a.id, a)
    for (const [id, a] of seenAttachmentsRef.current) if (!map.has(id) && !hiddenIds[id]) map.set(id, a)
    seenAttachmentsRef.current = map
    return map
  }, [app.attachments, app.items, hiddenIds])

  const galleryPhotos = useMemo<GalleryPhoto[]>(
    () =>
      visiblePhotos.map((a, index) => ({
        id: a.id,
        uri: resolvePreviewUri(a, localUris),
        uploading: a.uploadStatus === 'pending',
        failed: a.uploadStatus === 'failed',
        progress: c.uploadProgress[a.id] ?? 0,
        onPress: () => c.onOpenPhoto(null, index),
        onRemove: () => confirmRemovePhoto(() => c.onRemoveApplicationAttachment(a.id)),
        onRetry: () => c.onRetryApplicationAttachment(a.id),
      })),
    [
      visiblePhotos,
      localUris,
      c.uploadProgress,
      c.onOpenPhoto,
      c.onRemoveApplicationAttachment,
      c.onRetryApplicationAttachment,
    ],
  )
  const hasReferenceGallery = Boolean(app.gallerySourceApplicationId)
  const removePhoto = useCallback(
    (attachmentId: string) => confirmRemovePhoto(() => c.onRemoveApplicationAttachment(attachmentId)),
    [c.onRemoveApplicationAttachment],
  )

  const resolveNoteAttachments = useCallback(
    (note: Note): NoteAttachmentView[] =>
      note.attachmentIds.flatMap((id) => {
        const attachment = attachmentsById.get(id)
        if (!attachment) return []
        const index = visiblePhotos.indexOf(attachment)
        return [
          {
            attachment,
            uri: resolvePreviewUri(attachment, localUris),
            progress: c.uploadProgress[id] ?? 0,
            viewerIndex: index === -1 ? null : index,
          },
        ]
      }),
    [attachmentsById, visiblePhotos, localUris, c.uploadProgress],
  )

  const feedDays = useMemo(() => {
    const days: { label: string; notes: Note[] }[] = []
    for (const note of feed.notes ?? []) {
      const label = dayLabel(note.createdAt)
      const last = days[days.length - 1]
      if (last?.label === label) last.notes.push(note)
      else days.push({ label, notes: [note] })
    }
    return days
  }, [feed.notes])

  const openNoteMenu = useCallback(
    (note: Note) => {
      const audio = resolveNoteAttachments(note).find((a) => a.attachment.mimeType?.startsWith('audio/'))
      const audioUri = audio?.uri
      presentNoteMenu({
        onEdit: () => {
          setTab('atividade')
          setEditingNote(note)
          setDraft(note.text)
        },
        onRegenerate:
          audio && audioUri
            ? () => void runRegenerate(note, { uri: audioUri, attachmentId: audio.attachment.id })
            : undefined,
        onDelete: () => confirmDeleteNote(note, note.attachmentIds.length > 0),
      })
    },
    [resolveNoteAttachments],
  )
  const openPhoto = useCallback((index: number) => c.onOpenPhoto(null, index), [c.onOpenPhoto])

  const cancelEdit = () => {
    setEditingNote(null)
    setDraft('')
  }

  const submit = () => {
    const text = draft.trim()
    if (tab === 'pendencias') {
      if (!text) return
      c.onOpenAddItem()
      c.newItemForm.setValue('title', text, { shouldDirty: true })
      setDraft('')
      return
    }
    if (editingNote) {
      if (!text && editingNote.attachmentIds.length === 0) {
        Alert.alert('Nota vazia', 'Para apagar a nota, use "Excluir nota".')
        return
      }
      editNoteText(editingNote, text)
      cancelEdit()
      return
    }
    if (postNote(app.id, text)) setDraft('')
  }

  /** Photos from the library become one note, with whatever is typed in the composer as its caption. */
  const pickFromLibrary = async () => {
    const picked = await pickPhotos('library')
    if (picked.length === 0) return
    const caption = draft
    setDraft('')
    const commits = picked.map((asset, i) => {
      const attachmentId = beginAttachment()
      return commitAsset({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        attachmentId,
        applicationId: app.id,
        itemId: null,
        position: app.attachments.length + i,
      }).then(() => attachmentId)
    })
    // Every `addAttachment` must be queued before the note that references it.
    const settled = await Promise.allSettled(commits)
    const ids = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    postNote(app.id, caption, ids)
  }

  /** Atividade and (prototype) Fotos post notes; Pendências adds checklist items. */
  const notesComposer = tab !== 'pendencias'
  const recording = c.voiceState === 'recording'
  const processingVoice = c.voiceState === 'processing'
  const onMic = () => {
    if (!FEATURE_FLAG.voice) return
    if (recording) void c.onStopRecording()
    else if (!processingVoice) void c.onStartRecording()
  }

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (tab !== 'atividade') return
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - LOAD_MORE_THRESHOLD) feed.fetchNextPage()
  }

  const editingItem = c.editingItem
  const itemDraftValues = c.itemDraftValues

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollViewContainer
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: space.xl }}
        onScroll={onScroll}
        onMomentumScrollEnd={onScrollEnd}
        onScrollEndDrag={onScrollEnd}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={[s.banner, bannerStyle]} />

        <View style={[s.sheetHeader, { marginTop: bannerHeight - OVERLAP }]}>
          <View style={s.avatarRow}>
            <Animated.View style={[s.avatar, avatarStyle]}>
              <Text style={s.avatarText}>{initials(c.checklist.title)}</Text>
            </Animated.View>
            <View style={s.headerActions}>
              <Pressable
                style={({ pressed }) => [s.pillButton, pressed && { opacity: 0.7 }]}
                onPress={c.onEditApplication}
              >
                <Icon name="edit-pen" size={13} color={colors.ink.base} />
                <Text style={s.pillButtonText}>Editar</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.pillButton, s.pillButtonPrimary, pressed && { opacity: 0.85 }]}
                onPress={() =>
                  presentApplicationCompletionPicker((action) =>
                    action === 'draft' ? c.onSaveDraft() : c.onComplete(),
                  )
                }
              >
                <Icon name="check" size={13} color={colors.white} />
                <Text style={[s.pillButtonText, { color: colors.white }]}>Concluir</Text>
              </Pressable>
            </View>
          </View>
          <Text
            style={s.name}
            numberOfLines={2}
            onLayout={(e) => {
              nameY.value = bannerHeight - OVERLAP + e.nativeEvent.layout.y + e.nativeEvent.layout.height
            }}
          >
            {c.checklist.title}
          </Text>
          <View style={s.metaRow}>
            <View style={s.metaItem}>
              <Icon name="calendar" size={15} color={colors.gray[600]} />
              <Text style={s.metaText}>{fmtDate(visitAt)}</Text>
            </View>
          </View>
          <View style={s.tagsRow}>
            <Badge
              label={app.status === 'completed' ? 'Concluída' : 'Rascunho'}
              tone={app.status === 'completed' ? 'completed' : 'draft'}
            />
            <TagChipList labels={c.tagsCatalog.resolveLabels(app.tagsIds)} />
          </View>
          {c.applicationError ? <Text style={fillStyles.modalError}>{c.applicationError}</Text> : null}
        </View>

        <Animated.View
          style={[s.tabs, tabsStyle]}
          onLayout={(e) => {
            tabsY.value = e.nativeEvent.layout.y
          }}
        >
          {TABS.map((t) => (
            <Pressable key={t} style={s.tab} onPress={() => setTab(t)}>
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'atividade' ? 'Atividade' : t === 'fotos' ? `Fotos · ${visiblePhotos.length}` : 'Pendências'}
              </Text>
              {tab === t && <View style={s.tabIndicator} />}
            </Pressable>
          ))}
        </Animated.View>

        <View style={s.tabContent}>
          {tab === 'fotos' ? (
            <VisitaGallery photos={galleryPhotos} reference={hasReferenceGallery} />
          ) : tab === 'atividade' ? (
            <View>
              {feed.notes === undefined ? (
                <ActivityIndicator style={s.feedSpinner} color={colors.gray[400]} />
              ) : feed.notes.length === 0 ? (
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
                          onOpenPhoto={openPhoto}
                          onRetryAttachment={c.onRetryApplicationAttachment}
                          onRemoveAttachment={removePhoto}
                          onOpenMenu={openNoteMenu}
                        />
                      ))}
                    </AnimatePresence>
                  </View>
                ))
              )}
              {feed.isFetchingNextPage ? <ActivityIndicator style={s.feedSpinner} color={colors.gray[400]} /> : null}
            </View>
          ) : (
            <View style={s.pendencias}>
              <View style={s.pendHeader}>
                <View style={fillStyles.progressCol}>
                  <Text style={fillStyles.progressText}>
                    {c.progress.done}/{c.progress.total} concluídos · {DERIVED_STATE_LABEL[c.derivedState]}
                  </Text>
                  <ProgressBar progress={c.progress.total > 0 ? c.progress.done / c.progress.total : 0} />
                </View>
                <View style={fillStyles.itemsHeaderRow}>
                  <Text style={fillStyles.itemsTitle}>Itens do checklist</Text>
                  <Pressable
                    style={({ pressed }) => [fillStyles.addItemButton, pressed && { opacity: 0.7 }]}
                    onPress={c.onOpenAddItem}
                  >
                    <Icon name="plus" size={14} color={colors.blue.base} />
                    <Text style={fillStyles.addItemButtonText}>Adicionar item</Text>
                  </Pressable>
                </View>
              </View>
              <View>
                {c.groups.map((group) => (
                  <ApplicationItemGroupSection
                    key={group.key}
                    title={group.title}
                    groupItems={group.children}
                    total={group.total}
                    answered={group.answered}
                    checklist={c.checklist}
                    suggestionEnabled={FEATURE_FLAG.suggestion}
                    resolveTagLabel={c.resolveTagLabel}
                    onToggleComplete={c.onToggleComplete}
                    onToggleGroupComplete={c.onToggleGroupComplete}
                    onOpenDrawer={c.onOpenDrawer}
                    onAcceptSuggestion={c.onAcceptSuggestion}
                    onRejectSuggestion={c.onRejectSuggestion}
                  />
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollViewContainer>

      <View style={[s.topBar, { height: barHeight, paddingTop: insets.top }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, s.topBarBg, barBgStyle]} />
        <Pressable style={s.back} onPress={c.onBack} hitSlop={10} accessibilityLabel="Voltar">
          <Glyph name="arrow-left" color={colors.white} />
        </Pressable>
        <View style={s.topTitleCol}>
          <Text style={s.topTitle}>Visita</Text>
          <Animated.Text style={[s.topSubtitle, barNameStyle]} numberOfLines={1}>
            {c.checklist.title}
          </Animated.Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* WhatsApp-style composer: pill with attach + camera inside, round mic/send outside. */}
      <View style={[s.composerBar, { paddingBottom: (keyboardOpen ? 0 : insets.bottom) + space.sm }]}>
        <AnimatePresence>
          {editingNote ? (
            <MotiView
              key="edit-banner"
              style={s.editBanner}
              from={{ opacity: 0, translateY: 8 }}
              animate={{ opacity: 1, translateY: 0 }}
              exit={{ opacity: 0, translateY: 8 }}
              transition={{ type: 'timing', duration: 180 }}
            >
              <Icon name="edit-pen" size={12} color={colors.blue.base} />
              <Text style={s.editBannerText} numberOfLines={1}>
                Editando nota
              </Text>
              <Pressable hitSlop={10} onPress={cancelEdit} accessibilityLabel="Cancelar edição">
                <Icon name="multiply" size={14} color={colors.gray[600]} />
              </Pressable>
            </MotiView>
          ) : null}
        </AnimatePresence>
        <View style={s.composerRow}>
          <View style={s.pill}>
            {recording || processingVoice ? (
              <View style={s.recordingRow}>
                {recording ? (
                  <MotiView
                    style={s.recordingDot}
                    from={{ opacity: 1, scale: 1 }}
                    animate={{ opacity: 0.25, scale: 0.8 }}
                    transition={{ type: 'timing', duration: 650, loop: true }}
                  />
                ) : (
                  <ActivityIndicator size="small" color={colors.blue.base} />
                )}
                <Text style={s.recordingText}>{recording ? 'Gravando… toque para enviar' : 'Transcrevendo…'}</Text>
              </View>
            ) : (
              <>
                {notesComposer && !editingNote && (
                  <Pressable
                    style={s.pillIcon}
                    hitSlop={8}
                    accessibilityLabel="Anexar"
                    onPress={() =>
                      presentAttachPicker({
                        onCamera: onOpenNoteCamera,
                        onLibrary: () => void pickFromLibrary(),
                      })
                    }
                  >
                    <Icon name="plus" size={22} color={colors.gray[600]} />
                  </Pressable>
                )}
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={notesComposer ? 'Escrever nota' : 'Digitar nova pendência'}
                  placeholderTextColor={colors.gray[400]}
                  style={[
                    s.composerInput,
                    (!notesComposer || editingNote) && {
                      paddingLeft: space.md,
                    },
                  ]}
                  multiline
                />
                {notesComposer && !editingNote && !draft.trim() && (
                  <Pressable style={s.pillIcon} hitSlop={8} accessibilityLabel="Câmera" onPress={onOpenNoteCamera}>
                    <Icon name="camera" size={20} color={colors.gray[600]} />
                  </Pressable>
                )}
              </>
            )}
          </View>
          {draft.trim() || editingNote || !notesComposer || !FEATURE_FLAG.voice ? (
            <Pressable
              style={({ pressed }) => [
                s.roundAction,
                !draft.trim() && !editingNote && { opacity: 0.4 },
                pressed && { opacity: 0.8 },
              ]}
              accessibilityLabel={editingNote ? 'Salvar nota' : 'Enviar'}
              onPress={submit}
            >
              <MotiView
                key={editingNote ? 'save' : 'send'}
                from={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 14 }}
              >
                {editingNote ? <Icon name="check" size={18} color={colors.white} /> : <SendGlyph />}
              </MotiView>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                s.roundAction,
                recording && s.roundActionRecording,
                processingVoice && { opacity: 0.4 },
                pressed && { opacity: 0.8 },
              ]}
              disabled={processingVoice}
              accessibilityLabel={recording ? 'Parar e enviar áudio' : 'Gravar áudio'}
              onPress={onMic}
            >
              <MotiView
                key={recording ? 'stop' : 'mic'}
                from={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 14 }}
              >
                {recording ? <View style={s.stopGlyph} /> : <Icon name="mic" size={20} color={colors.white} />}
              </MotiView>
            </Pressable>
          )}
        </View>
      </View>

      {editingItem && itemDraftValues && (
        <ItemDrawer
          visible
          onClose={c.onCloseItemDrawer}
          itemIndex={c.editingItemIndex + 1}
          itemsTotal={c.editingItemsTotal}
          title={editingItem.title}
          completionVariant={c.editingItemCompletionVariant}
          onSelectStatus={(status) => c.onSelectStatus(editingItem.id, status)}
          note={itemDraftValues.note}
          onNoteChange={(note) => c.itemForm.setValue('note', note, { shouldDirty: true })}
          tagsIds={itemDraftValues.tagsIds}
          availableTags={c.tagsCatalog.activeTags}
          allTagsById={c.tagsCatalog.tagsById}
          onChangeTags={(tagsIds) => c.itemForm.setValue('tagsIds', tagsIds, { shouldDirty: true })}
          onCreateTag={c.tagsCatalog.createTag}
          quantity={itemDraftValues.quantity}
          onQuantityChange={(quantity) => c.itemForm.setValue('quantity', quantity, { shouldDirty: true })}
          attachments={editingItem.attachments}
          uploadProgress={c.uploadProgress}
          onAddPhoto={() => c.onAddPhoto(editingItem.id)}
          onRemoveAttachment={(attachmentId) => c.onRemoveItemAttachment(editingItem.id, attachmentId)}
          onRetryAttachment={(attachmentId) => c.onRetryItemAttachment(editingItem.id, attachmentId)}
          onOpenPhoto={(index) => c.onOpenPhoto(editingItem.id, index)}
          onSave={c.onSaveItemDrawer}
        />
      )}

      <PhotoViewer
        visible={c.viewer !== null}
        photos={c.viewerPhotos}
        initialIndex={c.viewer?.index ?? 0}
        onClose={c.onCloseViewer}
        onDelete={(attachmentId) => confirmRemovePhoto(() => c.onDeletePhotoFromViewer(attachmentId))}
      />

      <AppBottomSheet
        visible={c.addingItem}
        onClose={c.onCloseAddItem}
        snapPoints={['95%']}
        footerComponent={renderAddItemFooter}
      >
        <BottomSheetView style={fillStyles.sheetContent}>
          <View style={fillStyles.modalField}>
            <Text style={fillStyles.modalFieldLabel}>Título do item</Text>
            <Form.TextField control={c.newItemForm.control} name="title" placeholder="Ex.: Base de shaft 5" />
          </View>
          <View style={fillStyles.modalField}>
            <Text style={fillStyles.modalFieldLabel}>Tags do item</Text>
            <Form.TagSelect
              control={c.newItemForm.control}
              name="tagsIds"
              availableTags={c.tagsCatalog.activeTags}
              allTagsById={c.tagsCatalog.tagsById}
              onCreateTag={c.tagsCatalog.createTag}
            />
          </View>
          <Form.ErrorText message={c.newItemForm.formState.errors.root?.message} />
        </BottomSheetView>
      </AppBottomSheet>
      <AppBottomSheet
        visible={c.editingApplication}
        onClose={c.onCloseEditApplication}
        snapPoints={['95%']}
        footerComponent={renderEditApplicationFooter}
      >
        <BottomSheetView style={fillStyles.sheetContent}>
          <View style={fillStyles.modalField}>
            <Text style={fillStyles.modalFieldLabel}>Tags da aplicação</Text>
            <Form.TagSelect
              control={c.metaForm.control}
              name="tagsIds"
              availableTags={c.tagsCatalog.activeTags}
              allTagsById={c.tagsCatalog.tagsById}
              onCreateTag={c.tagsCatalog.createTag}
            />
            <Form.ErrorText message={c.metaForm.formState.errors.tagsIds?.message} />
          </View>
          <View style={fillStyles.modalField}>
            <Text style={fillStyles.modalFieldLabel}>Data da visita</Text>
            <Form.DateField control={c.metaForm.control} name="date" />
          </View>
          {c.applicationError ? <Text style={fillStyles.modalError}>{c.applicationError}</Text> : null}
          <Pressable
            style={({ pressed }) => [s.deleteRow, pressed && { opacity: 0.7 }]}
            onPress={() => {
              c.onCloseEditApplication()
              c.onDelete()
            }}
          >
            <Icon name="trash-2" size={16} color={colors.danger.base} />
            <Text style={s.deleteText}>Excluir aplicação</Text>
          </Pressable>
        </BottomSheetView>
      </AppBottomSheet>

      <ConfirmBottomSheet
        snapPoints={['30%']}
        visible={c.deleteConfirmationVisible}
        title={`Excluir esta aplicação de "${c.checklist.title}"?`}
        message={`${c.progress.answered} de ${c.progress.total} itens respondidos e todas as fotos anexadas serão excluídos.`}
        confirmLabel="Excluir aplicação"
        onCancel={c.onCancelDelete}
        onConfirm={c.onConfirmDelete}
      />
    </KeyboardAvoidingView>
  )
}

const DARK = colors.ink.base
const TOP_BAR = 52
const BANNER_EXTRA = 56
const OVERLAP = 24

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  scroll: { backgroundColor: colors.white },
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: DARK,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  topBarBg: { backgroundColor: DARK },
  back: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitleCol: { flex: 1, alignItems: 'center' },
  topTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.white },
  topSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.gray[400],
    maxWidth: '80%',
  },
  sheetHeader: {
    zIndex: 1,
    paddingHorizontal: 20,
    paddingBottom: space.md,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderCurve: 'continuous',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginTop: -36,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: colors.blue.tint,
    alignItems: 'center',
    justifyContent: 'center',
    transformOrigin: 'left bottom',
  },
  avatarText: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.blue.base,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerActions: { flexDirection: 'row', gap: space.sm, paddingTop: space.md },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  pillButtonPrimary: {
    backgroundColor: colors.blue.base,
    borderColor: colors.blue.base,
  },
  pillButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.ink.base,
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
  },
  deleteText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.danger.base,
  },
  name: { ...textStyles.screenTitle, fontSize: 20, marginTop: space.sm },
  metaRow: { flexDirection: 'row', gap: space.lg, marginTop: space.sm },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  metaText: { ...textStyles.body, flexShrink: 1 },
  tabs: {
    zIndex: 10,
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    paddingHorizontal: space.lg,
  },
  tabContent: { zIndex: 0, backgroundColor: colors.white },
  tab: { flex: 1, alignItems: 'center', paddingVertical: space.md },
  tabText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.gray[600],
  },
  tabTextActive: { fontFamily: fontFamily.bold, color: colors.blue.base },
  tabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: space.sm,
    right: space.sm,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.blue.base,
  },
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
  pendencias: { paddingTop: space.lg },
  pendHeader: { paddingHorizontal: 20, gap: space.lg, marginBottom: space.sm },
  composerBar: {
    paddingHorizontal: 6,
    paddingTop: 6,
    gap: 6,
    backgroundColor: colors.gray[100],
  },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: colors.blue.base,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
  },
  editBannerText: {
    ...textStyles.bodyStrong,
    color: colors.blue.base,
    flex: 1,
  },
  recordingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 44,
    paddingHorizontal: space.md,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger.base,
  },
  recordingText: { ...textStyles.body, color: colors.ink.base },
  roundActionRecording: { backgroundColor: colors.danger.base },
  stopGlyph: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 44,
    paddingHorizontal: 4,
    borderRadius: 22,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pillIcon: {
    width: 38,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.ink.base,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 4,
  },
  roundAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.blue.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
