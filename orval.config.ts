import { defineConfig } from "orval";

export default defineConfig({
	vistoriaApi: {
		input: {
			target: "./openapi.json",
			unsafeDisableValidation: true,
		},
		output: {
			client: "react-query",
			httpClient: "fetch",
			mode: "tags-split",
			target: "src/lib/api/endpoints",
			schemas: "src/lib/api/models",
			baseUrl: {
				runtime: "process.env.EXPO_PUBLIC_BACKEND_BASE_URL ?? 'http://localhost:3000'",
			},
			override: {
				operations: Object.fromEntries(
					Object.entries({
						getByOrgIdProjects: "listProjects",
						postByOrgIdProjects: "createProject",
						getByOrgIdProjectsByProjectId: "getProject",
						deleteByOrgIdProjectsByProjectId: "deleteProject",
						getByOrgIdProjectsByProjectIdTags: "listTags",
						postByOrgIdProjectsByProjectIdTags: "createTag",
						getByOrgIdProjectsByProjectIdChecklists: "listChecklists",
						postByOrgIdProjectsByProjectIdChecklists: "createChecklist",
						getByOrgIdProjectsByProjectIdChecklistsById: "getChecklist",
						putByOrgIdProjectsByProjectIdChecklistsById: "updateChecklist",
						deleteByOrgIdProjectsByProjectIdChecklistsById: "deleteChecklist",
						getByOrgIdProjectsByProjectIdApplications: "listApplications",
						postByOrgIdProjectsByProjectIdApplications: "createApplication",
						getByOrgIdProjectsByProjectIdApplicationsById: "getApplication",
						patchByOrgIdProjectsByProjectIdApplicationsById: "updateApplication",
						deleteByOrgIdProjectsByProjectIdApplicationsById: "deleteApplication",
						postByOrgIdProjectsByProjectIdApplicationsByIdItems: "addApplicationItem",
						"patchByOrgIdProjectsByProjectIdApplication-itemsById": "updateApplicationItem",
						postByOrgIdProjectsByProjectIdApplicationsByIdAttachments: "addApplicationAttachment",
						postByOrgIdProjectsByProjectIdUploadsPresign: "presignUpload",
						patchByOrgIdProjectsByProjectIdAttachmentsById: "updateAttachment",
						deleteByOrgIdProjectsByProjectIdAttachmentsById: "deleteAttachment",
						getByOrgIdProjectsByProjectIdReportsTags: "getReportTags",
					}).map(([operationId, name]) => [
						operationId,
						{ operationName: () => name },
					]),
				),
				mutator: {
					path: "./src/lib/api/fetcher.ts",
					name: "f",
				},
			},
		},
	},
	vistoriaZod: {
		input: {
			target: "./openapi.json",
			unsafeDisableValidation: true,
		},
		output: {
			client: "zod",
			mode: "tags-split",
			target: "src/lib/api/zod",
			fileExtension: ".zod.ts",
			override: {
				zod: {
					version: 4,
					strict: {
						body: true,
						response: true,
						query: true,
						header: true,
						param: true,
					},
				},
			},
		},
	},
});