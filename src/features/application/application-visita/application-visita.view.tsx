// PROTOTYPE — Visita redesign (Pencil nodes VJeSH "Atividade" / c5JmB "Pendências"),
// restyled onto the app's design system (purple, Lato, tokens).
// Real: visit date, visit photos (published from the composer "+" → Câmera/Galeria,
// same pipeline as variant A), and the Pendências tab, which is variant A's checklist list.
// Mocked (visita.prototype.mock.json / in-memory): profile, visit number, audio posts,
// text posts typed into the composer. Throw away once a direction is picked.
import { BottomSheetView } from '@gorhom/bottom-sheet'
import { useEffect, useMemo, useState } from 'react'
import { ActionSheetIOS, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
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
import { AppBottomSheet, Badge, ConfirmBottomSheet, Form, TagChipList, ItemDrawer, PhotoGalleryRow, PhotoViewer, ProgressBar } from '@/components'
import { Icon } from '@/components/Icon'
import { useSheetFooterActions } from '@/components/SheetFooterActions'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import { pickPhotos } from '@/lib/convex/photo-picker'
import { useLocalUploadUris } from '@/lib/uploads/upload-store'
import { colors, fontFamily, radius, space, textStyles } from '@/styles'
import { resolvePreviewUri } from '../../shared/attachment-preview'
import { useAttachmentVisibility } from '../../shared/attachment-visibility'
import { useAttachPhotos } from '../../shared/use-attach-photos'
import { presentApplicationCompletionPicker } from '../application-completion-picker'
import { styles as fillStyles } from '../application-fill.styles'
import type { useApplicationFillContainer } from '../application-fill.container'
import { ApplicationItemGroupSection } from '../components/ApplicationItemGroupSection'
import mock from './visita.prototype.mock.json'

type FillContainer = ReturnType<typeof useApplicationFillContainer>

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}
const fmtDur = (sec: number) => `0:${String(sec).padStart(2, '0')}`

/* glyphs missing from the icon registry */
function Glyph({ name, size = 16, color }: { name: 'arrow-left' | 'mail' | 'image'; size?: number; color: string }) {
  const p = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'arrow-left' && <Path d="M19 12H5M12 19l-7-7 7-7" {...p} />}
      {name === 'mail' && <Path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 7l9 6 9-6" {...p} />}
      {name === 'image' && <Path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 16l5-5 4 4 3-3 4 4M15 9h.01" {...p} />}
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

/** Native attach picker, same pattern as application-completion-picker. */
function presentAttachPicker({ onCamera, onLibrary }: { onCamera: () => void; onLibrary: () => void }) {
  const options = [
    { label: 'Câmera', run: onCamera },
    { label: 'Galeria de fotos', run: onLibrary },
  ]
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...options.map((o) => o.label), 'Cancelar'], cancelButtonIndex: options.length, userInterfaceStyle: 'light' },
      (index) => options[index]?.run(),
    )
    return
  }
  Alert.alert('Publicar na atividade', undefined, [
    ...options.map((o) => ({ text: o.label, onPress: o.run })),
    { text: 'Cancelar', style: 'cancel' as const },
  ])
}

type Post =
  | { kind: 'text'; id: string; at: string; text: string }
  | { kind: 'audio'; id: string; at: string; durationSec: number; transcript: string }
  | { kind: 'photos'; id: string; at: string; attachmentIds: string[] }

export function VisitaPrototype({ c }: { c: FillContainer }) {
  const insets = useSafeAreaInsets()
  const localUris = useLocalUploadUris()
  const hiddenIds = useAttachmentVisibility((state) => state.hiddenIds)
  const { beginAttachment, commitAsset } = useAttachPhotos()
  const [tab, setTab] = useState<'atividade' | 'pendencias'>('atividade')
  const [draft, setDraft] = useState('')
  // The keyboard covers the home-indicator area, so its safe-area padding only applies while it's closed.
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true))
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  const [textPosts, setTextPosts] = useState<Post[]>([])

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
    opacity: interpolate(scrollY.value, [bannerHeight - barHeight - OVERLAP - 1, bannerHeight - barHeight - OVERLAP], [0, 1], Extrapolation.CLAMP),
  }))
  // Name fades into the bar once the in-page name has scrolled under it.
  const barNameStyle = useAnimatedStyle(() => {
    const start = nameY.value - barHeight
    return {
      opacity: interpolate(scrollY.value, [start, start + 24], [0, 1], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(scrollY.value, [start, start + 24], [8, 0], Extrapolation.CLAMP) }],
    }
  })
  const avatarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(scrollY.value, [0, 60], [1, 0.72], Extrapolation.CLAMP) }],
  }))
  // Manual sticky: pins the tabs right under the top bar (stickyHeaderIndices can only pin at y=0).
  const tabsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, scrollY.value - (tabsY.value - barHeight)) }],
  }))

  const renderEditApplicationFooter = useSheetFooterActions({ confirmLabel: 'Salvar', onConfirm: c.onSaveApplication })
  const renderAddItemFooter = useSheetFooterActions({ confirmLabel: 'Adicionar', onConfirm: c.onSaveNewItem })

  const app = c.application
  const visitAt = app.date || app.createdAt
  // Same list (and indices) variant A's gallery hands to the PhotoViewer.
  const visiblePhotos = useMemo(
    () => app.attachments.filter((a) => !a.deletedAt && !hiddenIds[a.id]),
    [app.attachments, hiddenIds],
  )

  const posts = useMemo<Post[]>(() => {
    const byDay = new Map<string, string[]>()
    for (const a of visiblePhotos) {
      const day = (a.createdAt || visitAt).slice(0, 10)
      byDay.set(day, [...(byDay.get(day) ?? []), a.id])
    }
    const photoPosts: Post[] = [...byDay].map(([day, ids]) => ({
      kind: 'photos',
      id: `photos-${day}`,
      at: visiblePhotos.find((a) => a.id === ids[ids.length - 1])?.createdAt || day,
      attachmentIds: ids,
    }))
    const mocked: Post[] = [
      { kind: 'text', id: 'note', at: visitAt, text: app.transcript || mock.fallbackNote },
      ...mock.audios.map((a) => ({ kind: 'audio' as const, id: a.id, at: visitAt, durationSec: a.durationSec, transcript: a.transcript })),
    ]
    return [...mocked, ...photoPosts, ...textPosts].sort((a, b) => a.at.localeCompare(b.at))
  }, [visiblePhotos, visitAt, app.transcript, textPosts])

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    if (tab === 'atividade') {
      setTextPosts((prev) => [...prev, { kind: 'text', id: `t${Date.now()}`, at: new Date().toISOString(), text }])
    } else {
      c.onOpenAddItem()
      c.newItemForm.setValue('title', text, { shouldDirty: true })
    }
    setDraft('')
  }

  const pickFromLibrary = async () => {
    const picked = await pickPhotos('library')
    picked.forEach((asset, i) => {
      void commitAsset({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        attachmentId: beginAttachment(),
        applicationId: app.id,
        itemId: null,
        position: app.attachments.length + i,
      })
    })
  }

  const editingItem = c.editingItem
  const itemDraftValues = c.itemDraftValues

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollViewContainer
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: space.xl }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={[s.banner, bannerStyle]} />

        <View style={[s.sheetHeader, { marginTop: bannerHeight - OVERLAP }]}>
          <View style={s.avatarRow}>
            <Animated.Image source={{ uri: mock.profile.photoUrl }} style={[s.avatar, avatarStyle]} />
            <View style={s.headerActions}>
              <Pressable style={({ pressed }) => [s.pillButton, pressed && { opacity: 0.7 }]} onPress={c.onEditApplication}>
                <Icon name="edit-pen" size={13} color={colors.ink.base} />
                <Text style={s.pillButtonText}>Editar</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.pillButton, s.pillButtonPrimary, pressed && { opacity: 0.85 }]}
                onPress={() => presentApplicationCompletionPicker((action) => (action === 'draft' ? c.onSaveDraft() : c.onComplete()))}
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
            {c.checklist.title || mock.profile.name}
          </Text>
          <View style={s.metaRow}>
            <View style={s.metaItem}>
              <Glyph name="mail" size={15} color={colors.gray[600]} />
              <Text style={s.metaText} numberOfLines={1}>
                {mock.profile.responsibleEmail}
              </Text>
            </View>
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
          {(['atividade', 'pendencias'] as const).map((t) => (
            <Pressable key={t} style={s.tab} onPress={() => setTab(t)}>
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t === 'atividade' ? 'Atividade' : 'Pendências'}</Text>
              {tab === t && <View style={s.tabIndicator} />}
            </Pressable>
          ))}
        </Animated.View>

        <View style={s.tabContent}>
        {tab === 'atividade' ? (
          <View>
            {posts.map((post) => (
              <View key={post.id} style={s.post}>
                {post.kind === 'text' && (
                  <>
                    <Text style={s.postDate}>{fmtDate(post.at)}</Text>
                    <Text style={s.postText}>{post.text}</Text>
                  </>
                )}
                {post.kind === 'audio' && (
                  <>
                    <Text style={s.postDate}>
                      {fmtDate(post.at)} · Áudio · {fmtDur(post.durationSec)}
                    </Text>
                    <View style={s.audioRow}>
                      <View style={s.playButton}>
                        <Icon name="play" size={14} color={colors.white} />
                      </View>
                      <View style={s.audioTrack} />
                      <Text style={s.audioPos}>0:00 / {fmtDur(post.durationSec)}</Text>
                    </View>
                    <Text style={s.transcript}>“{post.transcript}”</Text>
                  </>
                )}
                {post.kind === 'photos' && (
                  <>
                    <Text style={s.postDate}>
                      {fmtDate(post.at)} · {post.attachmentIds.length} {post.attachmentIds.length === 1 ? 'foto' : 'fotos'}
                    </Text>
                    <PhotoGalleryRow
                      photos={post.attachmentIds.flatMap((id) => {
                        const a = visiblePhotos.find((x) => x.id === id)
                        if (!a) return []
                        return [
                          {
                            id,
                            uri: resolvePreviewUri(a, localUris),
                            uploading: a.uploadStatus === 'pending',
                            failed: a.uploadStatus === 'failed',
                            progress: c.uploadProgress[id] ?? 0,
                            onPress: () => c.onOpenPhoto(null, visiblePhotos.indexOf(a)),
                            onRemove: () => c.onRemoveApplicationAttachment(id),
                            onRetry: () => c.onRetryApplicationAttachment(id),
                          },
                        ]
                      })}
                    />
                  </>
                )}
              </View>
            ))}
          </View>
        ) : (
          <View style={s.pendencias}>
            <View style={s.pendHeader}>
              <View style={fillStyles.progressCol}>
                <Text style={fillStyles.progressText}>
                  {c.progress.done}/{c.progress.total} concluídos
                </Text>
                <ProgressBar progress={c.progress.total > 0 ? c.progress.done / c.progress.total : 0} />
              </View>
              <View style={fillStyles.itemsHeaderRow}>
                <Text style={fillStyles.itemsTitle}>Itens do checklist</Text>
                <Pressable style={({ pressed }) => [fillStyles.addItemButton, pressed && { opacity: 0.7 }]} onPress={c.onOpenAddItem}>
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
          <Text style={s.topTitle}>Visita {mock.visitNumber}</Text>
          <Animated.Text style={[s.topSubtitle, barNameStyle]} numberOfLines={1}>
            {c.checklist.title || mock.profile.name}
          </Animated.Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* WhatsApp-style composer: pill with attach + camera inside, round mic/send outside. */}
      <View style={[s.composerBar, { paddingBottom: (keyboardOpen ? 0 : insets.bottom) + space.sm }]}>
        <View style={s.pill}>
          {tab === 'atividade' && (
            <Pressable style={s.pillIcon} hitSlop={8} accessibilityLabel="Anexar" onPress={() => presentAttachPicker({ onCamera: c.onAddApplicationPhoto, onLibrary: pickFromLibrary })}>
              <Icon name="plus" size={22} color={colors.gray[600]} />
            </Pressable>
          )}
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={tab === 'atividade' ? 'Escrever atualização' : 'Digitar nova pendência'}
            placeholderTextColor={colors.gray[400]}
            style={[s.composerInput, tab !== 'atividade' && { paddingLeft: space.md }]}
            multiline
          />
          {tab === 'atividade' && !draft.trim() && (
            <Pressable style={s.pillIcon} hitSlop={8} accessibilityLabel="Câmera" onPress={c.onAddApplicationPhoto}>
              <Icon name="camera" size={20} color={colors.gray[600]} />
            </Pressable>
          )}
        </View>
        <Pressable
          style={({ pressed }) => [s.roundAction, pressed && { opacity: 0.8 }]}
          accessibilityLabel={draft.trim() ? 'Enviar' : 'Gravar áudio'}
          onPress={draft.trim() ? submit : () => Alert.alert('Áudio', 'Em breve.')}
        >
          {draft.trim() ? <SendGlyph /> : <Icon name="mic" size={20} color={colors.white} />}
        </Pressable>
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
        onDelete={c.onDeletePhotoFromViewer}
      />

      <AppBottomSheet visible={c.addingItem} onClose={c.onCloseAddItem} snapPoints={['95%']} footerComponent={renderAddItemFooter}>
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
  banner: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: DARK },
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
  back: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  topTitleCol: { flex: 1, alignItems: 'center' },
  topTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.white },
  topSubtitle: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.gray[400], maxWidth: '80%' },
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
    backgroundColor: colors.gray[100],
    transformOrigin: 'left bottom',
  },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
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
  pillButtonPrimary: { backgroundColor: colors.blue.base, borderColor: colors.blue.base },
  pillButtonText: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.ink.base },
  tagsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  deleteText: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.danger.base },
  name: { ...textStyles.screenTitle, fontSize: 20, marginTop: space.sm },
  metaRow: { flexDirection: 'row', gap: space.lg, marginTop: space.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
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
  tabText: { fontFamily: fontFamily.regular, fontSize: 15, color: colors.gray[600] },
  tabTextActive: { fontFamily: fontFamily.bold, color: colors.blue.base },
  tabIndicator: { position: 'absolute', bottom: -1, left: space.sm, right: space.sm, height: 3, borderRadius: 2, backgroundColor: colors.blue.base },
  post: { paddingHorizontal: space.lg + 4, paddingVertical: space.lg, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.gray[200] },
  postDate: { ...textStyles.metaLabel, color: colors.gray[600] },
  postText: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21, color: colors.ink.base },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  playButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.blue.base, alignItems: 'center', justifyContent: 'center' },
  audioTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.blue.tint },
  audioPos: { ...textStyles.metaLabel },
  transcript: { ...textStyles.body, color: colors.ink.base, fontStyle: 'italic' },
  pendencias: { paddingTop: space.lg },
  pendHeader: { paddingHorizontal: 20, gap: space.lg, marginBottom: space.sm },
  composerBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingHorizontal: 6,
    paddingTop: 6,
    backgroundColor: colors.gray[100],
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
  pillIcon: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
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
  roundAction: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.blue.base, alignItems: 'center', justifyContent: 'center' },
})
