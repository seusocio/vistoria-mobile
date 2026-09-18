import { Text } from 'react-native'
import { textStyles } from '@/styles'
import { styles } from '../styles'

export interface ErrorTextProps {
  message?: string
}

/** First per-field error surface in the app; existing screens duplicate this exact style as `styles.error`. */
export function ErrorText({ message }: ErrorTextProps) {
  if (!message) return null
  return <Text style={[textStyles.body, styles.errorText]}>{message}</Text>
}
