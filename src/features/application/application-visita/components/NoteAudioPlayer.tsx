import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Icon } from '@/components/Icon'
import { colors, space, textStyles } from '@/styles'

const fmt = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** One audio attachment inside a note. `uri` is the local file while it's still uploading, the signed URL after. */
export function NoteAudioPlayer({ uri, uploading }: { uri: string | undefined; uploading: boolean }) {
  const player = useAudioPlayer(uri ? { uri } : null)
  const status = useAudioPlayerStatus(player)
  const duration = status.duration || 0
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0

  async function toggle() {
    if (status.playing) {
      player.pause()
      return
    }
    // The recorder leaves the session in record mode; playback needs the
    // speaker and must ignore the silent switch, like a voice message would.
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    })
    if (status.didJustFinish || (duration > 0 && status.currentTime >= duration)) await player.seekTo(0)
    player.play()
  }

  return (
    <View style={styles.row}>
      <Pressable
        style={({ pressed }) => [styles.play, !uri && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
        onPress={toggle}
        disabled={!uri}
        hitSlop={8}
        accessibilityLabel={status.playing ? 'Pausar áudio' : 'Reproduzir áudio'}
      >
        {status.playing ? <View style={styles.pauseGlyph} /> : <Icon name="play" size={14} color={colors.white} />}
      </Pressable>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.time}>
        {uploading && !status.isLoaded ? 'enviando…' : `${fmt(status.currentTime)} / ${fmt(duration)}`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  play: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.blue.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseGlyph: {
    width: 10,
    height: 12,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderColor: colors.white,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.blue.tint,
    overflow: 'hidden',
  },
  trackFill: { height: '100%', backgroundColor: colors.blue.base },
  time: { ...textStyles.metaLabel, minWidth: 64, textAlign: 'right' },
})
