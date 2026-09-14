import "react-native-reanimated";
import {
	Lato_400Regular,
	Lato_700Bold,
	useFonts,
} from "@expo-google-fonts/lato";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { ConvexProvider } from "convex/react";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { convexClient } from "@/infra/convex";
import { migrateLocalDataToConvex } from "@/infra/storage";
import { Routes } from "@/routes";
import { colors } from "@/styles";

const startupStyles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 24,
	},
	title: {
		fontSize: 20,
		fontWeight: "700",
		marginBottom: 8,
		color: colors.ink.base,
	},
	message: {
		color: colors.gray[600],
		textAlign: "center",
		marginBottom: 20,
	},
	retryButton: {
		backgroundColor: colors.blue.base,
		borderRadius: 12,
		paddingHorizontal: 20,
		paddingVertical: 13,
	},
	retryText: {
		color: colors.white,
		fontWeight: "700",
	},
});

void SplashScreen.preventAutoHideAsync();

function StartupError({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		<View style={startupStyles.container} accessibilityRole="alert">
			<Text style={startupStyles.title}>Não foi possível carregar o app</Text>
			<Text style={startupStyles.message}>{message}</Text>
			<Pressable
				onPress={onRetry}
				accessibilityRole="button"
				accessibilityLabel="Tentar carregar novamente"
				style={startupStyles.retryButton}
			>
				<Text style={startupStyles.retryText}>Tentar novamente</Text>
			</Pressable>
		</View>
	);
}

export default function App() {
	const [fontsLoaded] = useFonts({
		Lato_400Regular,
		Lato_700Bold,
	});
	const [dataReady, setDataReady] = useState(false);
	const [startupError, setStartupError] = useState<string | null>(null);
	const [migrationAttempt, setMigrationAttempt] = useState(0);

	// migrationAttempt intentionally re-runs startup after the user taps retry.
	// biome-ignore lint/correctness/useExhaustiveDependencies: state is a retry signal
	useEffect(() => {
		let mounted = true;
		setDataReady(false);
		setStartupError(null);

		migrateLocalDataToConvex()
			.catch((error: unknown) => {
				if (!mounted) return;
				setStartupError(
					error instanceof Error
						? error.message
						: "Verifique sua conexão e tente novamente.",
				);
			})
			.finally(() => {
				if (mounted) setDataReady(true);
			});

		return () => {
			mounted = false;
		};
	}, [migrationAttempt]);

	useEffect(() => {
		if (fontsLoaded && (dataReady || startupError)) {
			void SplashScreen.hideAsync();
		}
	}, [fontsLoaded, dataReady, startupError]);

	if (!fontsLoaded || (!dataReady && !startupError)) {
		return null;
	}

	if (startupError) {
		return (
			<StartupError
				message={startupError}
				onRetry={() => setMigrationAttempt((attempt) => attempt + 1)}
			/>
		);
	}

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<SafeAreaProvider>
				<BottomSheetModalProvider>
					<ConvexProvider client={convexClient}>
						<Routes />
					</ConvexProvider>
				</BottomSheetModalProvider>
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}
