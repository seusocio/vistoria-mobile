import { LinkingOptions } from '@react-navigation/native'
import { StackRoutesList } from './types'

export const linking: LinkingOptions<StackRoutesList> = {
  prefixes: [],
  config: {
    screens: {
      tabs: {
        screens: {
          home: '',
          overview: 'overview',
          account: 'account',
        },
      },
      checklistNew: 'checklists/new',
      checklistDetail: 'checklists/:checklistId',
      checklistEdit: 'checklists/:checklistId/edit',
      applicationNew: 'checklists/:checklistId/applications/new',
      applicationFill: 'checklists/:checklistId/applications/:applicationId',
    },
  },
}
