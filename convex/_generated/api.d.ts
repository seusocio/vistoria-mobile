/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as applications from "../applications.js";
import type * as checklists from "../checklists.js";
import type * as files from "../files.js";
import type * as migrations from "../migrations.js";
import type * as seed from "../seed.js";
import type * as seedApplications from "../seedApplications.js";
import type * as seedData_planilha20260916 from "../seedData/planilha20260916.js";
import type * as seedData_vistoria from "../seedData/vistoria.js";
import type * as tags from "../tags.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  applications: typeof applications;
  checklists: typeof checklists;
  files: typeof files;
  migrations: typeof migrations;
  seed: typeof seed;
  seedApplications: typeof seedApplications;
  "seedData/planilha20260916": typeof seedData_planilha20260916;
  "seedData/vistoria": typeof seedData_vistoria;
  tags: typeof tags;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
