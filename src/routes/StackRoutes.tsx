import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ApplicationFill } from '@/app/ApplicationFill'
import { ApplicationNew } from '@/app/ApplicationNew'
import { ChecklistDetail } from '@/app/ChecklistDetail'
import { ChecklistEdit } from '@/app/ChecklistEdit'
import { ChecklistNew } from '@/app/ChecklistNew'
import { PhotoCapture } from '@/app/PhotoCapture'
import { TabRoutes } from './TabRoutes'
import { StackRoutesList } from './types'

export type { StackRoutesList, StackRoutesProps, TabRoutesList, TabRoutesProps } from './types'

const Stack = createNativeStackNavigator<StackRoutesList>()

export function StackRoutes() {
  return (
    <Stack.Navigator
      initialRouteName="tabs"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="tabs" component={TabRoutes} />
      <Stack.Screen name="checklistNew" component={ChecklistNew} />
      <Stack.Screen name="checklistDetail" component={ChecklistDetail} />
      <Stack.Screen name="checklistEdit" component={ChecklistEdit} />
      <Stack.Screen name="applicationNew" component={ApplicationNew} />
      <Stack.Screen name="applicationFill" component={ApplicationFill} />
      <Stack.Screen
        name="photoCapture"
        component={PhotoCapture}
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  )
}
