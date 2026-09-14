import 'react-native-reanimated'
import {
  Lato_400Regular,
  Lato_700Bold,
  useFonts,
} from '@expo-google-fonts/lato'
import { ConvexProvider } from 'convex/react'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState } from 'react'
import { convexClient } from '@/infra/convex'
import { migrateLocalDataToConvex } from '@/infra/storage'
import { Routes } from '@/routes'

SplashScreen.preventAutoHideAsync()

export default function App() {
  const [fontsLoaded] = useFonts({
    Lato_400Regular,
    Lato_700Bold,
  })
  const [dataReady, setDataReady] = useState(false)

  useEffect(() => {
    migrateLocalDataToConvex().finally(() => setDataReady(true))
  }, [])

  useEffect(() => {
    if (fontsLoaded && dataReady) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, dataReady])

  if (!fontsLoaded || !dataReady) {
    return null
  }

  return (
    <ConvexProvider client={convexClient}>
      <Routes />
    </ConvexProvider>
  )
}
