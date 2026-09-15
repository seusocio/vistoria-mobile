import { mutation, type MutationCtx } from "./_generated/server";

const collaborators = [
	"JORGE DA COSTA",
	"FAUSTO EDUARDO SILVA",
	"EDCLEY",
	"JOAO BATISTA",
	"LUIS",
	"JOAO PEDRO",
	"ADAILTON PEREIRA CRUZ",
	"JULIO CESAR DO AMARAL",
	"HELRYSON KENNED SODRE S.",
	"ISAIAS MAZZI LOPES S. C.",
	"EDMILTON SANTOS",
	"RAUL SOARES JR",
	"KAIO RODRIGUES COSTA",
	"RODOLFO OLIVEIRA NOVAES",
];

const towers = ["T1-A:FRENTE-RUA", "T2-B:FRENTE-PRAIA"];
const checklistCategories = ["Apartamentos", "Áreas comuns"];

const apartmentChecklistItems = [
	"Regularização de churrasqueira",
	"Aplicação de argamassa colante em churrasqueira",
	"Instalação de base de shaft cozinha",
	"Instalação de base de shaft area externa",
	"Instalação de base de shaft WC",
	"Instalação de base de shaft WCs",
	"Instalação de estrutura de shaft cozinha",
	"Instalação de estrutura de shaft area externa",
	"Instalação de estrutura de shaft WC",
	"Instalação de estrutura de shaft WCs",
	"Instalação de soleira WC",
	"Instalação de soleira WCS",
	"Instalacao de soleira entrada",
	"Instalação de soleira area externa",
	"Instalação de soleira Q1",
	"Instalação de soleira Q2",
	"Fechamento de furos",
	"Lixamento para recebimento de revestimento",
	"Impermeabilização",
	"Fechamento de tubulação",
	"Fechamento hidráulico",
	"Requadramento de esquadrias",
	"Limpeza",
];

const commonAreaChecklistItems = [
	"Lixamento de poço de elevadores",
	"Fechamento de furos em poço",
	"Pintura de tubulação pluvial",
	"Preenchimento de caçamba",
	"Transporte vertical de vasos sanitários",
];

const responseOptions = [
	{ label: "Sim", semantic: "positivo" as const },
	{ label: "Não", semantic: "negativo" as const },
	{ label: "Parcial", semantic: "neutro" as const },
];

function slugify(value: string) {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

function tagId(label: string) {
	return `seed-tag-${slugify(label)}`;
}

function apartmentLabels() {
	return Array.from({ length: 9 }, (_, floorIndex) =>
		Array.from(
			{ length: 6 },
			(_, unitIndex) => `APT-${(floorIndex + 1) * 10 + unitIndex + 1}`,
		),
	).flat();
}

async function ensureTag(
	ctx: MutationCtx,
	label: string,
	now: string,
): Promise<string> {
	const id = tagId(label);
	const normalizedLabel = label.trim().toLowerCase();
	const existingById = await ctx.db
		.query("tags")
		.withIndex("by_external_id", (q) => q.eq("id", id))
		.first();

	if (existingById) return existingById.id;

	const existingByLabel = await ctx.db
		.query("tags")
		.withIndex("by_normalized_label", (q) =>
			q.eq("normalizedLabel", normalizedLabel),
		)
		.first();

	if (existingByLabel) return existingByLabel.id;

	await ctx.db.insert("tags", {
		id,
		label,
		normalizedLabel,
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
	});
	return id;
}

async function ensureChecklist(
	ctx: MutationCtx,
	id: string,
	title: string,
	categoryTagId: string,
	itemTitles: string[],
	now: string,
) {
	const existing = await ctx.db
		.query("checklists")
		.withIndex("by_external_id", (q) => q.eq("id", id))
		.first();

	if (existing) return false;

	await ctx.db.insert("checklists", {
		id,
		title,
		tagsIds: [categoryTagId],
		options: responseOptions,
		source: "manual",
		items: itemTitles.map((itemTitle, index) => ({
			id: `${id}-item-${String(index + 1).padStart(2, "0")}`,
			position: index,
			title: itemTitle,
			description: "",
			tagsIds: [],
			createdAt: now,
			updatedAt: now,
			deletedAt: null,
		})),
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
	});
	return true;
}

export const run = mutation({
	args: {},
	handler: async (ctx) => {
		const now = new Date().toISOString();
		const apartments = apartmentLabels();
		const labels = [
			...collaborators,
			...towers,
			...checklistCategories,
			...apartments,
		];
		const tagIds: Record<string, string> = {};

		for (const label of labels) {
			tagIds[label] = await ensureTag(ctx, label, now);
		}

		const createdChecklists = [
			await ensureChecklist(
				ctx,
				"seed-checklist-apartamentos",
				"Vistoria de apartamentos",
				tagIds.Apartamentos,
				apartmentChecklistItems,
				now,
			),
			await ensureChecklist(
				ctx,
				"seed-checklist-areas-comuns",
				"Vistoria de áreas comuns",
				tagIds["Áreas comuns"],
				commonAreaChecklistItems,
				now,
			),
		].filter(Boolean).length;

		return {
			tags: labels.length,
			apartments: apartments.length,
			checklistsCreated: createdChecklists,
			checklistItems:
				apartmentChecklistItems.length + commonAreaChecklistItems.length,
		};
	},
});
