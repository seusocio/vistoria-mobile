import { useQuery } from "convex/react";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Screen, TagMultiSelect } from "@/components";
import { Icon } from "@/components/Icon";
import { useTagsCatalog } from "@/hooks/useTagsCatalog";
import type { Checklist } from "@/infra/domain/entities";
import { createApplication } from "@/infra/services";
import type { StackRoutesProps } from "@/routes/types";
import { colors } from "@/styles";
import { formatBrDate, todayIso } from "@/utils/date";
import { api } from "../../../convex/_generated/api";
import { styles } from "./styles";

export function ApplicationNew({
	navigation,
	route,
}: StackRoutesProps<"applicationNew">) {
	const { checklistId } = route.params;
	const checklistData = useQuery(api.checklists.findById, {
		id: checklistId,
	}) as Checklist | null | undefined;
	const checklist = checklistData ?? null;
	const loading = checklistData === undefined;
	const [tagsIds, setTagsIds] = useState<string[]>([]);
	const [date] = useState(todayIso());
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const tagsCatalog = useTagsCatalog();

	async function handleSubmit() {
		if (!checklist) return;
		setError(null);
		setSubmitting(true);
		try {
			const application = await createApplication(
				{ checklistId, tagsIds, date },
				checklist,
			);
			navigation.replace("applicationFill", {
				checklistId,
				applicationId: application.id,
			});
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Erro ao criar a aplicação",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Screen
			loading={loading || !checklist}
			variant="nested"
			navTitleTone="muted"
			onBack={() => navigation.goBack()}
			title={checklist?.title}
			footer={
				checklist ? (
					<Pressable
						style={({ pressed }) => [
							styles.startButton,
							tagsIds.length === 0 && styles.startButtonDisabled,
							pressed && { opacity: 0.7 },
						]}
						onPress={handleSubmit}
						disabled={submitting || tagsIds.length === 0}
					>
						<Text style={styles.startButtonText}>
							{submitting ? "Iniciando..." : "Iniciar preenchimento"}
						</Text>
						<Icon name="chevron-right" size={18} color={colors.white} />
					</Pressable>
				) : undefined
			}
		>
			{checklist && (
				<>
					<Text style={styles.title}>Nova aplicação</Text>

					<View style={styles.field}>
						<Text style={styles.fieldLabel}>Tags da aplicação</Text>
						<TagMultiSelect
							selectedIds={tagsIds}
							availableTags={tagsCatalog.activeTags}
							allTagsById={tagsCatalog.tagsById}
							onChange={setTagsIds}
							onCreateTag={tagsCatalog.createTag}
						/>
					</View>

					<View style={styles.field}>
						<Text style={styles.fieldLabel}>Data da visita</Text>
						<View style={styles.dateBox}>
							<Icon name="calendar" size={18} color={colors.gray[400]} />
							<Text style={styles.dateText}>{formatBrDate(date)}</Text>
						</View>
					</View>

					<View style={styles.helperRow}>
						<Icon name="clipboard-check" size={14} color={colors.gray[400]} />
						<Text style={styles.helperText}>
							Os {checklist.items.length} itens do modelo serão copiados para
							esta visita
						</Text>
					</View>

					{error ? <Text style={styles.error}>{error}</Text> : null}
				</>
			)}
		</Screen>
	);
}
