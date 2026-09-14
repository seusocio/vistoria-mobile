import { StackRoutesList } from '@/routes/types'

declare global {
  namespace ReactNavigation {
    interface RootParamList extends StackRoutesList {}
  }
}
