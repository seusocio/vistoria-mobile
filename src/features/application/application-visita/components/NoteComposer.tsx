import { AnimatePresence, MotiView } from 'moti'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { Icon } from '@/components/Icon'
import { FEATURE_FLAG } from '@/FEATURE_FLAG'
import { colors, fontFamily, radius, space, textStyles } from '@/styles'
import type { ApplicationFillContainer } from '../../application-fill/application-fill.container'
import type { NoteComposerState } from '../use-note-composer'
import { presentAttachPicker } from '../visita-prompts'

function SendGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" fill={colors.white} />
    </Svg>
  )
}

export interface NoteComposerProps {
  c: ApplicationFillContainer
  composer: NoteComposerState
  /** Atividade and (prototype) Fotos post notes; Pendências adds checklist items. */
  notesComposer: boolean
  onOpenNoteCamera: () => void
}

/** WhatsApp-style composer: pill with attach + camera inside, round mic/send outside. */
export function NoteComposer({ c, composer, notesComposer, onOpenNoteCamera }: NoteComposerProps) {
  const insets = useSafeAreaInsets()
  const { draft, setDraft, editingNote, cancelEdit, submit, pickFromLibrary } = composer
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

  const recording = c.voiceState === 'recording'
  const processingVoice = c.voiceState === 'processing'
  const onMic = () => {
    if (!FEATURE_FLAG.voice) return
    if (recording) void c.onStopRecording()
    else if (!processingVoice) void c.onStartRecording()
  }

  return (
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
  )
}

const s = StyleSheet.create({
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
