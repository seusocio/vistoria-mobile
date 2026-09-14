import { NavigationContainer } from '@react-navigation/native'
import { linking } from './linking'
import { StackRoutes } from './StackRoutes'

export function Routes() {
  return (
    <NavigationContainer linking={linking}>
      <StackRoutes />
    </NavigationContainer>
  )
}
