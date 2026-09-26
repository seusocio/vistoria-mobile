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