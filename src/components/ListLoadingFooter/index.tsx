import { ActivityIndicator, View } from 'react-native'
import { colors, space } from '@/styles'

/**
 * The footer a paged list shows while its next page is in flight. Rendered only
 * when `loading` is true — an always-mounted footer with a hidden spinner would
 * still add its height to the list's content, which is what makes the scroll
 * position jump as pages arrive.
 */
export function ListLoadingFooter({ loading }: { loading: boolean }) {
  if (!loading) return null
  return (
    <View style={{ paddingVertical: space.lg, alignItems: 'center' }}>
      <ActivityIndicator size="small" color={colors.blue.base} />
    </View>
  )
}
