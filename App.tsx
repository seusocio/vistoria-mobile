import "react-native-reanimated";
import {
	Lato_400Regular,
	Lato_700Bold,
	useFonts,
} from "@expo-google-fonts/lato";
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { ConvexProvider } from 'convex/react';
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SyncStatusBar, UndoToastProvider } from "@/components";
// Registers every offline-queue op before anything can drain the outbox.
import "@/features/ops";
import { convexClient } from '@/lib/convex'
import { queryClient } from '@/lib/query-client'
import { queryPersister } from '@/lib/query-persister'
import { registerBackgroundUploadTask } from '@/lib/uploads/background-task';
import { subscribeToUploadRecovery } from '@/lib/uploads/upload-store';
import { migrateLocalDataToConvex } from '@/lib/legacy/migrate-to-convex';
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

	// Legacy AsyncStorage import. Deliberately not awaited before render and
	// deliberately silent on failure: gating the first paint on a network call
	// is what used to leave a first launch with no connection stuck on an
	// error screen instead of an empty (and perfectly usable) Library.
	useEffect(() => {
		void migrateLocalDataToConvex().catch(() => undefined);
	}, []);
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
              <ConvexProvider client={convexClient}>
                <OutboxLifecycle />
                <SyncStatusBar />
                <Routes />
              </ConvexProvider>
            </PersistQueryClientProvider>
          </BottomSheetModalProvider>
        </UndoToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
	);
}
