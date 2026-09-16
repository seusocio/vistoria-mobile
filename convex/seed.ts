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

const cozinhaChecklistItems = [
	"Cozinha: Instalação hidráulica",
	"Cozinha: Fechamento de furos e tubulações",
	"Cozinha: Instalação de base de shaft",
	"Cozinha: Instalação de estrutura de shaft",
	"Cozinha: Instalação de drywall no shaft",
	"Cozinha: Regularização de shaft",
	"Cozinha: Aplicação de gesso",
	"Cozinha: Regularização de paredes",
	"Cozinha: Regularização de piso",
	"Cozinha: Lixamento de alvenaria para revestimento",
	"Cozinha: Impermeabilização",
	"Cozinha: Contrapiso",
	"Cozinha: Instalação de soleira",
	"Cozinha: Instalação de revestimento de parede",
	"Cozinha: Instalação de piso",
	"Cozinha: Lixamento de gesso para pintura",
	"Cozinha: Pintura",
	"Cozinha: Limpeza",
];

const quartoChecklistItems = [
	"Q: Fechamento de furos",
	"Q: Requadramento de esquadrias",
	"Q: Regularização de paredes",
	"Q: Regularização de piso",
	"Q: Lixamento de alvenaria para revestimento",
	"Q: Contrapiso",
	"Q: Instalação de soleira",
	"Q: Instalação de piso",
	"Q: Aplicação de gesso",
	"Q: Lixamento de gesso para pintura",
	"Q: Pintura",
	"Q: Limpeza",
];

const quartoSuiteChecklistItems = [
	"QS: Fechamento de furos",
	"QS: Requadramento de esquadrias",
	"QS: Regularização de paredes",
	"QS: Regularização de piso",
	"QS: Lixamento de alvenaria para revestimento",
	"QS: Contrapiso",
	"QS: Instalação de soleira",
	"QS: Instalação de piso",
	"QS: Aplicação de gesso",
	"QS: Lixamento de gesso para pintura",
	"QS: Pintura",
	"QS: Limpeza",
];

const wcChecklistItems = [
	"WC: Instalação hidráulica",
	"WC: Fechamento de furos e tubulações",
	"WC: Instalação de base de shaft",
	"WC: Instalação de estrutura de shaft",
	"WC: Instalação de drywall no shaft",
	"WC: Regularização de shaft",
	"WC: Aplicação de gesso",
	"WC: Regularização de paredes",
	"WC: Regularização de piso",
	"WC: Lixamento de alvenaria para revestimento",
	"WC: Impermeabilização",
	"WC: Contrapiso",
	"WC: Instalação de soleira",
	"WC: Instalação de revestimento de parede",
	"WC: Instalação de piso",
	"WC: Lixamento de gesso para pintura",
	"WC: Pintura",
	"WC: Limpeza",
];

const wcsChecklistItems = [
	"WCS: Instalação hidráulica",
	"WCS: Fechamento de furos e tubulações",
	"WCS: Instalação de base de shaft",
	"WCS: Instalação de estrutura de shaft",
	"WCS: Instalação de drywall no shaft",
	"WCS: Regularização de shaft",
	"WCS: Aplicação de gesso",
	"WCS: Regularização de paredes",
	"WCS: Regularização de piso",
	"WCS: Lixamento de alvenaria para revestimento",
	"WCS: Impermeabilização",
	"WCS: Contrapiso",
	"WCS: Instalação de soleira",
	"WCS: Instalação de revestimento de parede",
	"WCS: Instalação de piso",
	"WCS: Lixamento de gesso para pintura",
	"WCS: Pintura",
	"WCS: Limpeza",
];

const areaExternaChecklistItems = [
	"AE: Instalação hidráulica",
	"AE: Fechamento de furos e tubulações",
	"AE: Instalação de base de shaft",
	"AE: Instalação de estrutura de shaft",
	"AE: Instalação de drywall no shaft",
	"AE: Regularização de shaft",
	"AE: Aplicação de gesso",
	"AE: Regularização de paredes",
	"AE: Regularização de piso",
	"AE: Lixamento de alvenaria para revestimento",
	"AE: Impermeabilização",
	"AE: Contrapiso",
	"AE: Instalação de soleira",
	"AE: Instalação de revestimento",
	"AE: Instalação de piso",
	"AE: Lixamento de gesso para pinturas",
	"AE: Pintura",
	"AE: Limpeza",
];

const churrasqueiraChecklistItems = [
	"Churrasqueira: Regularização",
	"Churrasqueira: Lixamento para revestimento",
	"Churrasqueira: Impermeabilização",
	"Churrasqueira: Aplicação de argamassa colante",
	"Churrasqueira: Instalação de revestimento",
	"Churrasqueira: Instalação de soleira",
	"Churrasqueira: Rejuntamento",
	"Churrasqueira: Limpeza",
];

const apartmentChecklistItems = [
	...cozinhaChecklistItems,
	...quartoChecklistItems,
	...quartoSuiteChecklistItems,
	...wcChecklistItems,
	...wcsChecklistItems,
	...areaExternaChecklistItems,
	...churrasqueiraChecklistItems,
];

const hallChecklistItems = [
	"Hall: Fechamento de furos e tubulações",
	"Hall: Requadramento de esquadrias",
	"Hall: Regularização de paredes",
	"Hall: Regularização de piso",
	"Hall: Lixamento de alvenaria para revestimento",
	"Hall: Contrapiso",
	"Hall: Instalação de soleira",
	"Hall: Instalação de revestimento",
	"Hall: Instalação de piso",
	"Hall: Aplicação de gesso",
	"Hall: Lixamento de gesso para pintura",
	"Hall: Pintura",
	"Hall: Limpeza",
];

const escadasChecklistItems = [
	"Escadas: Fechamento de furos e tubulações",
	"Escadas: Regularização de paredes",
	"Escadas: Regularização de piso",
	"Escadas: Lixamento de alvenaria para revestimento",
	"Escadas: Contrapiso",
	"Escadas: Instalação de piso",
	"Escadas: Aplicação de gesso",
	"Escadas: Lixamento de gesso para pintura",
	"Escadas: Pintura",
	"Escadas: Limpeza",
];

const pocoElevadorChecklistItems = [
	"Poço de elevador: Fechamento de furos",
	"Poço de elevador: Regularização",
	"Poço de elevador: Lixamento",
	"Poço de elevador: Impermeabilização",
	"Poço de elevador: Pintura",
	"Poço de elevador: Limpeza",
];

const elevadorChecklistItems = [
	"Elevador: Fechamento de furos",
	"Elevador: Requadramento",
	"Elevador: Regularização",
	"Elevador: Lixamento",
	"Elevador: Instalação de revestimento",
	"Elevador: Instalação de piso",
	"Elevador: Instalação de soleira",
	"Elevador: Pintura",
	"Elevador: Limpeza",
];

const areaTecnicaChecklistItems = [
	"Área Técnica: Fechamento de furos e tubulações",
	"Área Técnica: Instalação de base de shaft",
	"Área Técnica: Instalação de estrutura de shaft",
	"Área Técnica: Instalação de drywall no shaft",
	"Área Técnica: Regularização de shaft",
	"Área Técnica: Aplicação de gesso",
	"Área Técnica: Lixamento de alvenaria para revestimento",
	"Área Técnica: Impermeabilização",
	"Área Técnica: Lixamento de gesso para pintura",
	"Área Técnica: Pintura",
	"Área Técnica: Limpeza",
];

const commonAreaChecklistItems = [
	...hallChecklistItems,
	...escadasChecklistItems,
	...pocoElevadorChecklistItems,
	...elevadorChecklistItems,
	...areaTecnicaChecklistItems,
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
	const items = itemTitles.map((itemTitle, index) => ({
		id: `${id}-item-${String(index + 1).padStart(3, "0")}`,
		position: index,
		title: itemTitle,
		description: "",
		tagsIds: [],
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
	}));

	const existing = await ctx.db
		.query("checklists")
		.withIndex("by_external_id", (q) => q.eq("id", id))
		.first();

	if (existing) {
		await ctx.db.patch(existing._id, {
			title,
			tagsIds: [categoryTagId],
			items,
			updatedAt: now,
		});
		return "updated" as const;
	}

	await ctx.db.insert("checklists", {
		id,
		title,
		tagsIds: [categoryTagId],
		options: responseOptions,
		source: "manual",
		items,
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
	});
	return "created" as const;
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

		const checklistResults = [
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
		];

		return {
			tags: labels.length,
			apartments: apartments.length,
			checklistsCreated: checklistResults.filter((r) => r === "created")
				.length,
			checklistsUpdated: checklistResults.filter((r) => r === "updated")
				.length,
			checklistItems:
				apartmentChecklistItems.length + commonAreaChecklistItems.length,
		};
	},
});
