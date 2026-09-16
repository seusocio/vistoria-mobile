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

export type TabRoutesProps<T extends keyof TabRoutesList> =
	CompositeScreenProps<
		NativeBottomTabScreenProps<TabRoutesList, T>,
		NativeStackScreenProps<StackRoutesList>
	>;
