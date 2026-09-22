import "react-native-reanimated";
import {
	Lato_400Regular,
	Lato_700Bold,
	useFonts,
} from "@expo-google-fonts/lato";
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { ConvexQueryCacheProvider } from 'convex-helpers/react/cache';
import { ConvexProvider } from 'convex/react';
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SyncStatusBar, UndoToastProvider } from "@/components";
// Registers every offline-queue op before anything can drain the outbox.
import "@/features/ops";
import { convexClient } from '@/lib/convex'
import { registerBackgroundUploadTask } from '@/lib/uploads/background-task';
import { subscribeToUploadRecovery } from '@/lib/uploads/upload-store';
import { migrateLocalDataToConvex } from '@/lib/legacy/migrate-to-convex';
import { useOutboxLifecycle } from '@/lib/offline-queue';
import { Routes } from "@/routes";

void SplashScreen.preventAutoHideAsync();

/**
 * Lives inside `ConvexProvider` because it reads the connection state, and
 * renders nothing: its whole job is to drain the persisted outbox at boot,
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
            <ConvexProvider client={convexClient}>
              <ConvexQueryCacheProvider>
                <OutboxLifecycle />
                <SyncStatusBar />
                <Routes />
              </ConvexQueryCacheProvider>
            </ConvexProvider>
          </BottomSheetModalProvider>
        </UndoToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
	);
}
