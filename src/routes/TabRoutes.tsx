import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Account } from '@/app/Account'
import { Library } from '@/app/Library'
import { Overview } from '@/app/Overview'
import { FloatingTabBar } from '@/components'
import { Icon, type IconName } from '@/components/Icon'
import { usesFloatingTabBar } from '@/lib/platform'
import { colors } from '@/styles'
import type { StackRoutesList, TabRoutesList } from './types'

function tabIcon(name: IconName) {
  return ({ color }: { color: string }) => (
    <Icon name={name} size={20} color={color} />
  )
}

/**
 * iOS 26 and Android: the real UITabBar / Material bar, with SF Symbols and
 * the system's own selection behaviour.
 *
 * "Nova" has to be a screen here because a native tab bar only holds tabs -
 * the placeholder renders nothing and the press is redirected to the stack.
 */
const NativeTab = createNativeBottomTabNavigator<TabRoutesList>()

function NewChecklistTabPlaceholder() {
  return null
}

function NativeTabRoutes() {
  return (
    <NativeTab.Navigator
      screenOptions={{ tabBarActiveTintColor: colors.blue.base }}
    >
      <NativeTab.Screen
        name="home"
        component={Library}
        options={{
          tabBarLabel: 'Checklists',
          tabBarIcon: { type: 'sfSymbol', name: 'list.clipboard' },
        }}
      />
      <NativeTab.Screen
        name="overview"
        component={Overview}
        options={{
          tabBarLabel: 'Relatório',
          tabBarIcon: { type: 'sfSymbol', name: 'chart.bar' },
        }}
      />
      <NativeTab.Screen
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
      <NativeTab.Screen
        name="account"
        component={Account}
        options={{
          tabBarLabel: 'Conta',
          tabBarIcon: { type: 'sfSymbol', name: 'person.crop.circle' },
        }}
      />
    </NativeTab.Navigator>
  )
}

/**
 * iOS 25 and below: our own pill. "Nova" is a button in the bar rather than a
 * tab, so `checklistNewAction` isn't registered at all.
 */
const JsTab = createBottomTabNavigator<TabRoutesList>()

function FloatingTabRoutes() {
  return (
    <JsTab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <FloatingTabBar
          {...props}
          primaryAction={{
            label: 'Nova checklist',
            onPress: () =>
              props.navigation
                .getParent<NativeStackNavigationProp<StackRoutesList>>()
                ?.navigate('checklistNew'),
          }}
        />
      )}
    >
      <JsTab.Screen
        name="home"
        component={Library}
        options={{
          tabBarLabel: 'Checklists',
          tabBarIcon: tabIcon('clipboard-check'),
        }}
      />
      <JsTab.Screen
        name="overview"
        component={Overview}
        options={{
          tabBarLabel: 'Relatório',
          tabBarIcon: tabIcon('bar-chart'),
        }}
      />
      <JsTab.Screen
        name="account"
        component={Account}
        options={{
          tabBarLabel: 'Conta',
          tabBarIcon: tabIcon('user'),
        }}
      />
    </JsTab.Navigator>
  )
}

export const TabRoutes = usesFloatingTabBar ? FloatingTabRoutes : NativeTabRoutes
