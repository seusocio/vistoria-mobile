import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { colors } from '@/styles'
import { Icon } from '../Icon'
import { styles } from './styles'

export type VoiceState = 'idle' | 'recording' | 'processing' | 'ready'

export interface VoiceCardProps {
  state: VoiceState
  transcript: string | null
  expanded: boolean
  onToggleExpanded: () => void
  onStart: () => void
  onStop: () => void
  onGenerateSuggestions: () => void
  generatingSuggestions?: boolean
}

const TITLE: Record<VoiceState, string> = {
  idle: 'Pronto para preencher por voz',
  recording: 'Gravação em andamento',
  processing: 'Processando gravação...',
  ready: 'Transcrição pronta',
}

const SUB: Record<VoiceState, string> = {
  idle: 'Toque para iniciar a gravação',
  recording: 'Toque para encerrar',
  processing: 'Aguarde alguns segundos',
  ready: 'Gravação de 1:24',
}

/** VoiceCard - Screen/Preenchimento & Screen/PreenchimentoComDrawer */
export function VoiceCard({
  state,
  transcript,
  expanded,
  onToggleExpanded,
  onStart,
  onStop,
  onGenerateSuggestions,
  generatingSuggestions = false,
}: VoiceCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <View style={styles.iconWrap}>
          <Icon
            name="mic"
            size={16}
            color={
              state === 'recording' ? colors.danger.base : colors.blue.base
            }
          />
        </View>
        <View style={styles.titleCol}>
          <Text style={styles.title}>{TITLE[state]}</Text>
          <Text style={styles.sub}>{SUB[state]}</Text>
        </View>
        {state === 'processing' && (
          <ActivityIndicator color={colors.blue.base} />
        )}
      </View>

      {state === 'idle' && (
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onStart}
          accessibilityRole="button"
          accessibilityLabel="Iniciar gravação"
        >
          <Icon name="mic" size={16} color={colors.white} />
          <Text style={styles.primaryButtonText}>Iniciar gravação</Text>
        </Pressable>
      )}

      {state === 'recording' && (
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            styles.dangerButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onStop}
          accessibilityRole="button"
          accessibilityLabel="Encerrar gravação"
        >
          <Icon name="square" size={16} color={colors.white} />
          <Text style={styles.primaryButtonText}>Encerrar gravação</Text>
        </Pressable>
      )}

      {state === 'ready' && (
        <>
          <Text
            style={styles.transcript}
            numberOfLines={expanded ? undefined : 2}
          >
            "{transcript}"
          </Text>
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.outlineButton,
                pressed && { opacity: 0.7 },
              ]}
              onPress={onToggleExpanded}
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Ver menos' : 'Ver mais'}
            >
              <Icon
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.ink.base}
              />
              <Text style={styles.outlineButtonText}>
                {expanded ? 'Ver menos' : 'Ver mais'}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && { opacity: 0.7 },
              ]}
              onPress={onGenerateSuggestions}
              disabled={generatingSuggestions}
              accessibilityRole="button"
              accessibilityLabel="Gerar sugestões"
              accessibilityState={{
                disabled: generatingSuggestions,
                busy: generatingSuggestions,
              }}
            >
              {generatingSuggestions ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Icon name="mic" size={15} color={colors.white} />
                  <Text style={styles.primaryButtonText}>Gerar sugestões</Text>
                </>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  )
}
