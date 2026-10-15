import "react-native-reanimated";
import {
	Lato_400Regular,
	Lato_700Bold,
	useFonts,
} from "@expo-google-fonts/lato";
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OutboxDebugger, SyncStatusBar, UndoToastProvider } from "@/components";
// Registers every offline-queue op before anything can drain the outbox.
import "@/features/ops";
import { queryClient } from '@/lib/query-client'
import { queryPersister } from '@/lib/query-persister'
import { registerBackgroundUploadTask } from '@/lib/uploads/background-task';
import { subscribeToUploadRecovery } from '@/lib/uploads/upload-store';
import { useOutboxLifecycle } from '@/lib/offline-queue';
import { Routes } from "@/routes";

void SplashScreen.preventAutoHideAsync();

/**
 * Renders nothing: its whole job is to drain the persisted outbox at boot,
 * on reconnect and on foreground.
 */
function OutboxLifecycle() {
	useOutboxLifecycle();
	return null;
}

export default function App() {
	const [fontsLoaded] = useFonts({
		Lato_400Regular,
		Lato_700Bold,
	});

	useEffect(() => subscribeToUploadRecovery(), []);
	useEffect(() => registerBackgroundUploadTask(), []);

	useEffect(() => {
		if (fontsLoaded) void SplashScreen.hideAsync();
	}, [fontsLoaded]);

	if (!fontsLoaded) {
		return null;
	}

	return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <UndoToastProvider>
          <BottomSheetModalProvider>
            <PersistQueryClientProvider
              client={queryClient}
              persistOptions={{ persister: queryPersister }}
            >
              <OutboxLifecycle />
              <SyncStatusBar />
              <OutboxDebugger />
              <Routes />
            </PersistQueryClientProvider>
          </BottomSheetModalProvider>
        </UndoToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
	);
}
