import { zodResolver } from "@hookform/resolvers/zod";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Pressable, Text, View } from "react-native";
import { ScrollViewContainer } from "react-native-reorderable-list";
import {
	AppBottomSheet,
	Badge,
	ConfirmBottomSheet,
	Form,
	ItemDrawer,
	PhotoViewer,
	ProgressBar,
	Screen,
	TagChipList,
	VoiceCard,
} from "@/components";
import { Icon } from "@/components/Icon";
import type { ItemCompletionVariant } from "@/components/ItemCard";
import { ApplicationItemGroupSection } from "./components/ApplicationItemGroupSection";
import { useSheetFooterActions } from "@/components/SheetFooterActions";
import { VoiceState } from "@/components/VoiceCard";
import { ApplicationGallery } from "./components/ApplicationGallery";
import { FEATURE_FLAG } from "@/FEATURE_FLAG";
import { useApplicationFill } from "@/hooks/useApplicationFill";
import { useApplicationMutations } from "@/hooks/useApplicationMutations";
import { useAttachPhotos } from "@/hooks/useAttachPhotos";
import { useTagsCatalog } from "@/hooks/useTagsCatalog";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import {
	ApplicationItemDraftFormValues,
	ApplicationMetaFormValues,
	applicationItemDraftSchema,
	applicationMetaSchema,
	NewApplicationItemFormValues,
	newApplicationItemSchema,
} from "@/infra/domain/schemas";
import type { ApplicationItem, WorkflowStatus } from "@/infra/domain/entities";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { generateId } from "@/infra/id";
import {
	applyItemEdits,
	mergeItemEdit,
	toItemPatches,
	type ItemEdit,
	type ItemEdits,
} from "./itemEdits";
import {
	generateSuggestions,
	getDerivedState,
	getProgress,
	groupItemsByTitlePrefix,
	isItemAnswerComplete,
	prepareTranscriber,
	sortItemsByChecklistOrder,
	transcribeAudio,
} from "@/infra/services";
import { useUploadStore } from "@/infra/uploads/upload-store";
import { StackRoutesProps } from "@/routes/types";
import { colors } from "@/styles";
import { haptics } from "@/utils/haptics";
import { styles } from "./styles";

const DERIVED_STATE_LABEL = {
	not_started: "Não iniciada",
	in_progress: "Executando",
	completed: "Completa",
} as const;

export function ApplicationFill({
	navigation,
	route,
}: StackRoutesProps<"applicationFill">) {
	const { checklistId, applicationId } = route.params;
	const {
		checklist,
		application: serverApplication,
		loading,
	} = useApplicationFill(checklistId, applicationId);
	// Item fields are edited here and saved in one request, like the checklist
	// form - so tapping through a group never touches the network, and never
	// lands a Convex transition in the middle of a navigation.
	const [itemEdits, setItemEdits] = useState<ItemEdits>({});
	const isDirty = Object.keys(itemEdits).length > 0;
	const applicationData = useMemo(
		() =>
			serverApplication ? applyItemEdits(serverApplication, itemEdits) : null,
		[serverApplication, itemEdits],
	);
	const editItem = useCallback((itemId: string, edit: ItemEdit) => {
		const editedAt = new Date().toISOString();
		setItemEdits((current) => mergeItemEdit(current, itemId, edit, editedAt));
	}, []);
	const unsavedGuard = useUnsavedChangesGuard(isDirty, navigation);
	const mutations = useApplicationMutations();
	const { removeAttachment: removeAttachmentPipeline } = useAttachPhotos();
	const tagsCatalog = useTagsCatalog();
	const { startRecording, stopRecording } = useVoiceRecorder();
	const uploadProgress = useUploadStore((state) => state.progress);
	const [viewer, setViewer] = useState<{
		itemId: string | null;
		index: number;
	} | null>(null);

	const [voiceState, setVoiceState] = useState<VoiceState>("idle");
	const [generatingSuggestions, setGeneratingSuggestions] = useState(false);
	const [editingItemId, setEditingItemId] = useState<string | null>(null);
	const itemForm = useForm<ApplicationItemDraftFormValues>({
		resolver: zodResolver(applicationItemDraftSchema),
		defaultValues: { note: "", tagsIds: [], quantity: null },
	});
	const [editingApplication, setEditingApplication] = useState(false);
	const metaForm = useForm<ApplicationMetaFormValues>({
		resolver: zodResolver(applicationMetaSchema),
		defaultValues: { tagsIds: [], date: "" },
	});
	const [applicationError, setApplicationError] = useState<string | null>(null);
	const [addingItem, setAddingItem] = useState(false);
	const newItemForm = useForm<NewApplicationItemFormValues>({
		resolver: zodResolver(newApplicationItemSchema),
		defaultValues: { title: "", tagsIds: [] },
	});
	const [deleteConfirmationVisible, setDeleteConfirmationVisible] =
		useState(false);
	const [deleting, setDeleting] = useState(false);
	const [completing, setCompleting] = useState(false);
	const submitted = useRef(false);
	const currentApplicationId = applicationData?.id;
	const currentTranscript = applicationData?.transcript;
	useEffect(() => {
		if (!FEATURE_FLAG.voice || !currentApplicationId) return;
		setVoiceState(currentTranscript ? "ready" : "idle");
	}, [currentApplicationId, currentTranscript]);
	useEffect(() => {
		// Warm up the WhisperKit model (downloads on first run) so stopping a
		// recording doesn't stall while the model loads. Errors surface later on
		// the actual transcription attempt.
		if (FEATURE_FLAG.voice) void prepareTranscriber();
	}, []);
	// Concluding and deleting both clear the edits and leave, but `beforeRemove`
	// still holds the closure from the render before that - navigating in the
	// same tick would pop the discard sheet on the way out. So the screen asks
	// to leave, and the exit happens on the render where it is already clean.
	const [exit, setExit] = useState<"completed" | "deleted" | null>(null);
	useEffect(() => {
		if (!exit || isDirty) return;
		if (exit === "completed") {
			navigation.navigate("checklistDetail", { checklistId });
		} else {
			navigation.replace("checklistDetail", { checklistId });
		}
	}, [exit, isDirty, checklistId, navigation]);

	const progress = useMemo(
		() =>
			applicationData
				? getProgress(applicationData)
				: { answered: 0, total: 0 },
		[applicationData],
	);
	// One sort and one completeness pass feed both lists below, instead of each
	// re-sorting every item and re-deriving completeness on every answer tap.
	const sortedItems = useMemo(
		() =>
			applicationData && checklist
				? sortItemsByChecklistOrder(applicationData.items, checklist)
				: [],
		[applicationData, checklist],
	);
	const completedIds = useMemo(() => {
		if (!checklist) return new Set<string>();
		const ids = new Set<string>();
		for (const item of sortedItems) {
			if (isItemAnswerComplete(item, checklist)) ids.add(item.id);
		}
		return ids;
	}, [sortedItems, checklist]);
	const groups = useMemo(
		() =>
			groupItemsByTitlePrefix(sortedItems).map((group) => {
				const incomplete = group.children.filter(
					(item) => !completedIds.has(item.id),
				);
				const completed = group.children.filter((item) =>
					completedIds.has(item.id),
				);
				return {
					key: group.label ?? "ungrouped",
					title: group.label ?? "Outros itens",
					total: group.children.length,
					answered: completed.length,
					// Completed items sink to the end of their own group's list instead
					// of moving to a separate section, so the group they belong to stays
					// legible while still keeping them out of the way of active items.
					children: [...incomplete, ...completed],
				};
			}),
		[sortedItems, completedIds],
	);
	const derivedState = applicationData
		? getDerivedState(applicationData)
		: "not_started";
	// Every prop handed to the memoized sections/rows below is stabilized here,
	// otherwise their memo() never holds and one tap re-renders every row.
	// (Expand/collapse is deliberately NOT here - each section owns its own, so
	// toggling one doesn't re-render this whole screen.)
	const resolveTagLabels = tagsCatalog.resolveLabels;
	const resolveTagLabel = useCallback(
		(item: ApplicationItem) => resolveTagLabels(item.tagsIds)[0],
		[resolveTagLabels],
	);
	const handleAnswerChange = useCallback(
		(itemId: string, answer: string) => {
			editItem(itemId, { answer, suggested: false, suggestionSource: null });
		},
		[editItem],
	);
	const positiveOptionLabel = checklist?.options.find(
		(option) => option.semantic === "positivo",
	)?.label;
	// Persisted on the item itself (workflowStatus) so it survives navigation
	// and app restarts, unlike the earlier screen-local prototype.
	const handleSetWorkflowStatus = useCallback(
		(itemId: string, workflowStatus: WorkflowStatus | null) => {
			editItem(itemId, { workflowStatus });
		},
		[editItem],
	);
	const handleToggleComplete = useCallback(
		(itemId: string) => {
			if (!positiveOptionLabel) return;
			const item = applicationData?.items.find(
				(candidate) => candidate.id === itemId,
			);
			const complete = item?.answer === positiveOptionLabel;
			handleAnswerChange(itemId, complete ? "" : positiveOptionLabel);
			if (!complete && item?.workflowStatus)
				handleSetWorkflowStatus(itemId, null);
		},
		[
			applicationData,
			handleAnswerChange,
			handleSetWorkflowStatus,
			positiveOptionLabel,
		],
	);
	const handleToggleGroupComplete = useCallback(
		(itemIds: string[], complete: boolean) => {
			if (complete && !positiveOptionLabel) return;
			for (const itemId of itemIds) {
				handleAnswerChange(
					itemId,
					complete ? (positiveOptionLabel as string) : "",
				);
				if (complete) {
					const item = applicationData?.items.find(
						(candidate) => candidate.id === itemId,
					);
					if (item?.workflowStatus) handleSetWorkflowStatus(itemId, null);
				}
			}
		},
		[
			applicationData,
			handleAnswerChange,
			handleSetWorkflowStatus,
			positiveOptionLabel,
		],
	);
	const handleSelectStatus = useCallback(
		(itemId: string, status: ItemCompletionVariant) => {
			if (status === "completed" || status === "idle") {
				const item = applicationData?.items.find(
					(candidate) => candidate.id === itemId,
				);
				const complete = item?.answer === positiveOptionLabel;
				const shouldComplete = status === "completed";
				if (complete !== shouldComplete && positiveOptionLabel) {
					handleAnswerChange(itemId, shouldComplete ? positiveOptionLabel : "");
				}
				if (item?.workflowStatus) handleSetWorkflowStatus(itemId, null);
				return;
			}
			handleSetWorkflowStatus(itemId, status);
		},
		[
			applicationData,
			handleAnswerChange,
			handleSetWorkflowStatus,
			positiveOptionLabel,
		],
	);
	const handleOpenItemDrawer = useCallback(
		(itemId: string) => {
			const item = applicationData?.items.find(
				(candidate) => candidate.id === itemId,
			);
			if (!item) return;
			itemForm.reset({
				note: item.note,
				tagsIds: [...item.tagsIds],
				quantity: item.quantity,
			});
			setEditingItemId(itemId);
		},
		[applicationData, itemForm],
	);
	const handleAcceptSuggestion = useCallback(
		(itemId: string) => {
			if (!FEATURE_FLAG.suggestion) return;
			editItem(itemId, { suggested: false, suggestionSource: null });
		},
		[editItem],
	);
	const handleRejectSuggestion = useCallback(
		(itemId: string) => {
			if (!FEATURE_FLAG.suggestion) return;
			editItem(itemId, {
				suggested: false,
				suggestionSource: null,
				answer: "",
				note: "",
			});
		},
		[editItem],
	);
	const renderEditApplicationFooter = useSheetFooterActions({
		confirmLabel: "Salvar",
		onConfirm: metaForm.handleSubmit(handleSaveApplication, () =>
			haptics.error(),
		),
	});
	const renderAddItemFooter = useSheetFooterActions({
		confirmLabel: "Adicionar",
		onConfirm: newItemForm.handleSubmit(handleSaveNewItem, () =>
			haptics.error(),
		),
	});
	if (loading || !checklist || !applicationData) {
		return (
			<Screen
				loading
				variant="nested"
				onBack={() => navigation.goBack()}
				title="Preenchimento"
			>
				{null}
			</Screen>
		);
	}
	const application = applicationData;
	function handleAddPhoto(itemId: string) {
		if (editingItemId === itemId && itemForm.formState.isDirty) {
			editItem(itemId, itemForm.getValues());
		}
		setEditingItemId(null);
		navigation.navigate("photoCapture", {
			applicationId: application.id,
			itemId,
		});
	}

	function handleAddApplicationPhoto() {
		navigation.navigate("photoCapture", {
			applicationId: application.id,
			itemId: null,
		});
	}

	function removeApplicationAttachment(attachmentId: string) {
		const attachment = application.attachments.find(
			(candidate) => candidate.id === attachmentId,
		);
		if (!attachment) return;
		removeAttachmentPipeline({
			applicationId: application.id,
			itemId: null,
			attachment,
			onError: () => setApplicationError("Não foi possível remover a foto"),
		});
	}

	function removeItemAttachment(itemId: string, attachmentId: string) {
		const item = application.items.find((candidate) => candidate.id === itemId);
		const attachment = item?.attachments.find(
			(candidate) => candidate.id === attachmentId,
		);
		if (!attachment) return;
		removeAttachmentPipeline({
			applicationId: application.id,
			itemId,
			attachment,
			onError: () => setApplicationError("Não foi possível remover a foto"),
		});
	}

	function retryApplicationAttachment(attachmentId: string) {
		const attachment = application.attachments.find(
			(candidate) => candidate.id === attachmentId,
		);
		if (!attachment) return;
		useUploadStore
			.getState()
			.enqueue({ applicationId: application.id, itemId: null, attachment });
	}

	function retryItemAttachment(itemId: string, attachmentId: string) {
		const item = application.items.find((candidate) => candidate.id === itemId);
		const attachment = item?.attachments.find(
			(candidate) => candidate.id === attachmentId,
		);
		if (!attachment) return;
		useUploadStore
			.getState()
			.enqueue({ applicationId: application.id, itemId, attachment });
	}

	async function handleStartRecording() {
		if (!FEATURE_FLAG.voice) return;
		try {
			await startRecording();
			setVoiceState("recording");
		} catch (error) {
			setApplicationError(
				error instanceof Error
					? error.message
					: "Não foi possível iniciar a gravação",
			);
		}
	}

	async function handleStopRecording() {
		if (!FEATURE_FLAG.voice) return;
		setVoiceState("processing");
		try {
			const uri = await stopRecording();
			if (!uri) throw new Error("Gravação vazia");
			const transcript = await transcribeAudio(uri);
			const updatedAt = new Date().toISOString();
			void mutations
				.updateMeta({
					applicationId: application.id,
					transcript,
					updatedAt,
				})
				.catch(() =>
					setApplicationError("Não foi possível salvar a transcrição"),
				);
			setVoiceState("ready");
		} catch (error) {
			setApplicationError(
				error instanceof Error
					? error.message
					: "Não foi possível transcrever a gravação",
			);
			setVoiceState(application.transcript ? "ready" : "idle");
		}
	}

	async function handleGenerateSuggestions() {
		if (!FEATURE_FLAG.suggestion) return;
		setGeneratingSuggestions(true);
		try {
			const suggestions = await generateSuggestions(checklist!, application);
			for (const suggestion of suggestions) {
				editItem(suggestion.itemId, {
					answer: suggestion.answer,
					note: suggestion.note ?? "",
					suggested: true,
					suggestionSource: "transcript" as const,
				});
			}
		} finally {
			setGeneratingSuggestions(false);
		}
	}

	/** Saves every pending item edit and closes the visit, in one round trip. */
	async function handleComplete() {
		if (submitted.current) return;
		submitted.current = true;
		setCompleting(true);
		setApplicationError(null);
		const updatedAt = new Date().toISOString();
		try {
			if (isDirty) {
				await mutations.patchItems({
					applicationId: application.id,
					patches: toItemPatches(itemEdits),
					updatedAt,
				});
			}
			await mutations.updateMeta({
				applicationId: application.id,
				status: "completed",
				completedAt: updatedAt,
				updatedAt,
			});
		} catch {
			// Nothing was cleared, so the edits are still on screen to retry with.
			submitted.current = false;
			setCompleting(false);
			setApplicationError(
				"Não foi possível concluir a aplicação. Verifique a conexão e tente de novo.",
			);
			return;
		}
		haptics.success();
		setItemEdits({});
		setExit("completed");
	}

	function handleDelete() {
		setDeleteConfirmationVisible(true);
	}

	function confirmDelete() {
		if (deleting) return;
		setDeleting(true);
		void mutations
			.softDelete({ id: application.id, deletedAt: new Date().toISOString() })
			.catch(() => setApplicationError("Não foi possível excluir a aplicação"));
		setDeleteConfirmationVisible(false);
		// Dropped along with the application, and cleared before leaving so the
		// discard sheet doesn't ask about edits that are being thrown away anyway.
		setItemEdits({});
		setExit("deleted");
	}

	function handleOpenEditApplication() {
		metaForm.reset({ tagsIds: application.tagsIds, date: application.date });
		setApplicationError(null);
		setEditingApplication(true);
	}

	function handleSaveApplication(values: ApplicationMetaFormValues) {
		const updatedAt = new Date().toISOString();
		void mutations
			.updateMeta({
				applicationId: application.id,
				tagsIds: values.tagsIds,
				date: values.date,
				updatedAt,
			})
			.catch(() => setApplicationError("Não foi possível salvar a aplicação"));
		setEditingApplication(false);
	}

	function handleOpenAddItem() {
		newItemForm.reset({ title: "", tagsIds: [] });
		setAddingItem(true);
	}

	function handleSaveNewItem(values: NewApplicationItemFormValues) {
		const now = new Date().toISOString();
		const item = {
			id: generateId("aitem_"),
			position: application.items.length,
			checklistItemId: null,
			title: values.title,
			description: "",
			answer: "",
			answeredAt: null,
			note: "",
			quantity: null,
			attachments: [],
			tagsIds: [...values.tagsIds],
			suggested: false,
			suggestionSource: null,
			workflowStatus: null,
			createdAt: now,
			updatedAt: now,
			deletedAt: null,
		};
		void mutations
			.addItem({ applicationId: application.id, item, updatedAt: now })
			.catch(() =>
				newItemForm.setError("root", {
					message: "Não foi possível adicionar o item",
				}),
			);
		setAddingItem(false);
	}
	const editingItem = editingItemId
		? application.items.find((item) => item.id === editingItemId)
		: null;
	const editingItemContainer = editingItem
		? (groups.find((group) =>
				group.children.some((child) => child.id === editingItem.id),
			)?.children ?? null)
		: null;
	const editingItemIndex = editingItemContainer
		? editingItemContainer.findIndex((child) => child.id === editingItem?.id)
		: -1;
	const editingItemsTotal = editingItemContainer?.length ?? 0;
	const itemDraft = editingItem ? itemForm.watch() : null;
	const editingItemCompletionVariant: ItemCompletionVariant =
		editingItem?.answer === positiveOptionLabel && positiveOptionLabel
			? "completed"
			: (editingItem?.workflowStatus ?? "idle");

	const viewerAttachments = viewer
		? (viewer.itemId === null
				? application.attachments
				: (application.items.find((item) => item.id === viewer.itemId)
						?.attachments ?? [])
			).filter((attachment) => !attachment.deletedAt)
		: [];
	const viewerPhotos = viewerAttachments.map((attachment) => ({
		id: attachment.id,
		uri: attachment.url ?? attachment.localUri,
		uploading: attachment.uploadStatus === "pending",
		progress: uploadProgress[attachment.id] ?? 0,
	}));

	return (
		<Screen
			ScrollComponent={ScrollViewContainer}
			variant="nested"
			navTitleTone="muted"
			onBack={() => navigation.goBack()}
			title={checklist.title}
			headerRight={
				<View style={styles.headerActions}>
					<Badge
						label={
							application.status === "completed" ? "Concluída" : "Rascunho"
						}
						tone={application.status === "completed" ? "completed" : "draft"}
					/>
					<Pressable
						style={({ pressed }) => [
							styles.headerActionButton,
							pressed && { opacity: 0.7 },
						]}
						hitSlop={12}
						onPress={handleDelete}
						accessibilityLabel="Excluir aplicação"
					>
						<Icon name="trash-2" size={16} color={colors.danger.base} />
					</Pressable>
				</View>
			}
			footer={
				<View style={styles.footerActions}>
					<Pressable
						style={({ pressed }) => [
							styles.completeButton,
							pressed && { opacity: 0.7 },
						]}
						onPress={() => void handleComplete()}
						disabled={completing}
					>
						<Icon name="check" size={18} color={colors.white} />
						<Text style={styles.completeButtonText}>
							{completing ? "Concluindo..." : "Concluir aplicação"}
						</Text>
					</Pressable>
				</View>
			}
		>
			<View style={styles.tagsRow}>
				<TagChipList labels={tagsCatalog.resolveLabels(application.tagsIds)} />
				<Pressable
					style={({ pressed }) => [
						styles.editAppButton,
						pressed && { opacity: 0.7 },
					]}
					hitSlop={12}
					onPress={handleOpenEditApplication}
					accessibilityLabel="Editar tags e data da aplicação"
				>
					<Icon name="edit-pen" size={12} color={colors.gray[600]} />
				</Pressable>
			</View>

			<View style={styles.progressCol}>
				<Text style={styles.progressText}>
					{progress.answered}/{progress.total} respondidos ·{" "}
					{DERIVED_STATE_LABEL[derivedState]}
				</Text>
				{applicationError ? (
					<Text style={styles.modalError}>{applicationError}</Text>
				) : null}
				<ProgressBar
					progress={progress.total > 0 ? progress.answered / progress.total : 0}
				/>
			</View>
			<View style={styles.gallerySection}>
				<View style={styles.galleryHeader}>
					<View>
						<Text style={styles.galleryTitle}>Galeria da aplicação</Text>
						<Text style={styles.gallerySubtitle}>
							{
								application.attachments.filter(
									(attachment) => !attachment.deletedAt,
								).length
							}{" "}
							anexadas
						</Text>
					</View>
					<Pressable
						style={({ pressed }) => [
							styles.addPhotoButton,
							pressed && { opacity: 0.7 },
						]}
						onPress={handleAddApplicationPhoto}
					>
						<Icon name="camera" size={16} color={colors.blue.base} />
						<Text style={styles.addPhotoButtonText}>Adicionar</Text>
					</Pressable>
				</View>
				{application.gallerySourceApplicationId ? (
					<Text style={styles.galleryReference}>
						Galeria da aplicação anterior disponível como referência.
					</Text>
				) : null}
				<ApplicationGallery
					attachments={application.attachments}
					uploadProgress={uploadProgress}
					onRemoveAttachment={removeApplicationAttachment}
					onRetryAttachment={retryApplicationAttachment}
					onOpenPhoto={(index) => setViewer({ itemId: null, index })}
				/>
			</View>

			{FEATURE_FLAG.voice && (
				<VoiceCard
					state={voiceState}
					transcript={application.transcript}
					onStart={handleStartRecording}
					onStop={handleStopRecording}
					onGenerateSuggestions={handleGenerateSuggestions}
					generatingSuggestions={generatingSuggestions}
				/>
			)}

			<View style={styles.itemsHeaderRow}>
				<Text style={styles.itemsTitle}>Itens do checklist</Text>
				<Pressable
					style={({ pressed }) => [
						styles.addItemButton,
						pressed && { opacity: 0.7 },
					]}
					onPress={handleOpenAddItem}
					accessibilityLabel="Adicionar item avulso"
				>
					<Icon name="plus" size={14} color={colors.blue.base} />
					<Text style={styles.addItemButtonText}>Adicionar item</Text>
				</Pressable>
			</View>

			<View style={styles.groupsList}>
				{groups.map((group) => (
					<ApplicationItemGroupSection
						key={group.key}
						title={group.title}
						groupItems={group.children}
						total={group.total}
						answered={group.answered}
						checklist={checklist}
						suggestionEnabled={FEATURE_FLAG.suggestion}
						resolveTagLabel={resolveTagLabel}
						onToggleComplete={handleToggleComplete}
						onToggleGroupComplete={handleToggleGroupComplete}
						onOpenDrawer={handleOpenItemDrawer}
						onAcceptSuggestion={handleAcceptSuggestion}
						onRejectSuggestion={handleRejectSuggestion}
						onError={setApplicationError}
					/>
				))}
			</View>

			{editingItem && itemDraft && (
				<ItemDrawer
					visible={Boolean(editingItem)}
					onClose={() => setEditingItemId(null)}
					itemIndex={editingItemIndex + 1}
					itemsTotal={editingItemsTotal}
					title={editingItem.title}
					completionVariant={editingItemCompletionVariant}
					onSelectStatus={(status) =>
						handleSelectStatus(editingItem.id, status)
					}
					note={itemDraft.note}
					onNoteChange={(note) =>
						itemForm.setValue("note", note, { shouldDirty: true })
					}
					tagsIds={itemDraft.tagsIds}
					availableTags={tagsCatalog.activeTags}
					allTagsById={tagsCatalog.tagsById}
					onChangeTags={(tagsIds) =>
						itemForm.setValue("tagsIds", tagsIds, { shouldDirty: true })
					}
					onCreateTag={tagsCatalog.createTag}
					quantity={itemDraft.quantity}
					onQuantityChange={(quantity) =>
						itemForm.setValue("quantity", quantity, { shouldDirty: true })
					}
					attachments={editingItem.attachments}
					uploadProgress={uploadProgress}
					onAddPhoto={() => handleAddPhoto(editingItem.id)}
					onRemoveAttachment={(attachmentId) =>
						removeItemAttachment(editingItem.id, attachmentId)
					}
					onRetryAttachment={(attachmentId) =>
						retryItemAttachment(editingItem.id, attachmentId)
					}
					onOpenPhoto={(index) => setViewer({ itemId: editingItem.id, index })}
					onSave={itemForm.handleSubmit((values) => {
						editItem(editingItem.id, values);
						setEditingItemId(null);
					})}
				/>
			)}

			<PhotoViewer
				visible={viewer !== null}
				photos={viewerPhotos}
				initialIndex={viewer?.index ?? 0}
				onClose={() => setViewer(null)}
				onDelete={(attachmentId) => {
					if (!viewer) return;
					if (viewer.itemId === null) removeApplicationAttachment(attachmentId);
					else removeItemAttachment(viewer.itemId, attachmentId);
				}}
			/>

			<AppBottomSheet
				visible={editingApplication}
				onClose={() => setEditingApplication(false)}
				snapPoints={["95%"]}
				footerComponent={renderEditApplicationFooter}
			>
				<BottomSheetView style={styles.sheetContent}>
					<View style={styles.modalField}>
						<Text style={styles.modalFieldLabel}>Tags da aplicação</Text>
						<Form.TagSelect
							control={metaForm.control}
							name="tagsIds"
							availableTags={tagsCatalog.activeTags}
							allTagsById={tagsCatalog.tagsById}
							onCreateTag={tagsCatalog.createTag}
						/>
						<Form.ErrorText
							message={metaForm.formState.errors.tagsIds?.message}
						/>
					</View>

					<View style={styles.modalField}>
						<Text style={styles.modalFieldLabel}>Data da visita</Text>
						<Form.DateField control={metaForm.control} name="date" />
					</View>

					{applicationError ? (
						<Text style={styles.modalError}>{applicationError}</Text>
					) : null}
				</BottomSheetView>
			</AppBottomSheet>

			<AppBottomSheet
				visible={addingItem}
				onClose={() => setAddingItem(false)}
				snapPoints={["95%"]}
				footerComponent={renderAddItemFooter}
			>
				<BottomSheetView style={styles.sheetContent}>
					<View style={styles.modalField}>
						<Text style={styles.modalFieldLabel}>Título do item</Text>
						<Form.TextField
							control={newItemForm.control}
							name="title"
							placeholder="Ex.: Base de shaft 5"
						/>
					</View>

					<View style={styles.modalField}>
						<Text style={styles.modalFieldLabel}>Tags do item</Text>
						<Form.TagSelect
							control={newItemForm.control}
							name="tagsIds"
							availableTags={tagsCatalog.activeTags}
							allTagsById={tagsCatalog.tagsById}
							onCreateTag={tagsCatalog.createTag}
						/>
					</View>

					<Form.ErrorText
						message={newItemForm.formState.errors.root?.message}
					/>
				</BottomSheetView>
			</AppBottomSheet>
			<ConfirmBottomSheet
				snapPoints={["30%"]}
				visible={deleteConfirmationVisible}
				title={`Excluir esta aplicação de "${checklist.title}"?`}
				message={`${progress.answered} de ${progress.total} itens respondidos e todas as fotos anexadas serão excluídos.`}
				confirmLabel="Excluir aplicação"
				confirming={deleting}
				onCancel={() => setDeleteConfirmationVisible(false)}
				onConfirm={confirmDelete}
			/>

			<ConfirmBottomSheet
				snapPoints={["25%"]}
				visible={unsavedGuard.visible}
				title="Descartar alterações?"
				message="Suas alterações não salvas serão perdidas."
				confirmLabel="Descartar"
				cancelLabel="Continuar editando"
				onCancel={unsavedGuard.onCancel}
				onConfirm={unsavedGuard.onConfirm}
			/>
		</Screen>
	);
}
