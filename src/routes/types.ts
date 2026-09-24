import type { NativeBottomTabScreenProps } from "@react-navigation/bottom-tabs/unstable";
import type {
	CompositeScreenProps,
	NavigatorScreenParams,
} from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type TabRoutesList = {
	home: undefined;
	overview: undefined;
	checklistNewAction: undefined;
	account: undefined;
};

export type StackRoutesList = {
	tabs: NavigatorScreenParams<TabRoutesList> | undefined;
	checklistNew: undefined;
	checklistDetail: { checklistId: string };
	checklistEdit: { checklistId: string };
	applicationNew: { checklistId: string };
	applicationFill: { checklistId: string; applicationId: string };
	photoCapture: { applicationId: string; itemId: string | null };
};

export type StackRoutesProps<T extends keyof StackRoutesList> =
	NativeStackScreenProps<StackRoutesList, T>;

/**
 * Typed against the native navigator, but below iOS 26 the runtime prop comes
 * from the JS one (see `usesFloatingTabBar`). The two agree on every
 * navigation action; they diverge on `setOptions`, so a tab screen should not
 * reach for navigator-specific options.
 */
export type TabRoutesProps<T extends keyof TabRoutesList> =
	CompositeScreenProps<
		NativeBottomTabScreenProps<TabRoutesList, T>,
		NativeStackScreenProps<StackRoutesList>
	>;
