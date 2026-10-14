import 'react-native-gesture-handler'

// React Native's AbortSignal has no `throwIfAborted`, which ky calls whenever
// it is handed a signal — React Query passes one to every orval-generated
// `useQuery`, so those reads failed with "undefined is not a function".
if (typeof AbortSignal.prototype.throwIfAborted !== 'function') {
  AbortSignal.prototype.throwIfAborted = function throwIfAborted() {
    if (this.aborted) throw this.reason
  }
}
import { registerRootComponent } from 'expo'

import App from './App'

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App)
