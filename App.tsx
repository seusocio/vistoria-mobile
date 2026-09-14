import 'react-native-reanimated'
import {
  Lato_400Regular,
  Lato_700Bold,
  useFonts,
} from '@expo-google-fonts/lato'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState } from 'react'
import { seedDemoDataIfNeeded } from '@/infra/data/seed'
import { Routes } from '@/routes'

SplashScreen.preventAutoHideAsync()

export default function App() {
  const [fontsLoaded] = useFonts({
    Lato_400Regular,
    Lato_700Bold,
  })
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    seedDemoDataIfNeeded().finally(() => setSeeded(true))
  }, [])

  useEffect(() => {
    if (fontsLoaded && seeded) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, seeded])

  if (!fontsLoaded || !seeded) {
    return null
  }

  return <Routes />
}
