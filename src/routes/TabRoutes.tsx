import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable'
import { Account } from '@/app/Account'
import { Library } from '@/app/Library'
import { Overview } from '@/app/Overview'
import { colors } from '@/styles'
import { TabRoutesList } from './types'

const Tab = createNativeBottomTabNavigator<TabRoutesList>()

function NewChecklistTabPlaceholder() {
  return null
}

export function TabRoutes() {
  return (
    <Tab.Navigator screenOptions={{ tabBarActiveTintColor: colors.blue.base }}>
      <Tab.Screen
        name="home"
        component={Library}
        options={{
          tabBarLabel: 'Checklists',
          tabBarIcon: { type: 'sfSymbol', name: 'list.clipboard' },
        }}
      />
      <Tab.Screen
        name="overview"
        component={Overview}
        options={{
          tabBarLabel: 'Relatório',
          tabBarIcon: { type: 'sfSymbol', name: 'chart.bar' },
        }}
      />
      <Tab.Screen
        name="checklistNewAction"
        component={NewChecklistTabPlaceholder}
        options={{
          tabBarLabel: 'Nova',
          tabBarIcon: { type: 'sfSymbol', name: 'plus.circle' },
          tabBarSelectionEnabled: false,
        }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            navigation.getParent()?.navigate('checklistNew')
          },
        })}
      />
      <Tab.Screen
        name="account"
        component={Account}
        options={{
          tabBarLabel: 'Conta',
          tabBarIcon: { type: 'sfSymbol', name: 'person.crop.circle' },
        }}
      />
    </Tab.Navigator>
  )
}
