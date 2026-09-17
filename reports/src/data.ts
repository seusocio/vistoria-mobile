import { ConvexHttpClient } from "convex/browser";
import sharp from "sharp";
import { readFileSync } from "node:fs";

export interface Attachment {
  id: string;
  name: string;
  createdAt: string;
  storageId?: string;
  url?: string;
  width?: number;
  height?: number;
}

export interface ApplicationItem {
  id: string;
  title: string;
  answer: string;
  note: string;
  quantity: number | null;
  attachments: Attachment[];
}

export interface Application {
  id: string;
  tagsIds: string[];
  date: string;
  status: "draft" | "completed";
  items: ApplicationItem[];
  attachments: Attachment[];
  completedAt: string | null;
  [k: string]: unknown;
}

export interface Tag {
  id: string;
  label: string;
}

export interface Environment {
  CONVEX_URL: string;
  CONVEX_SITE_URL?: string;
  [k: string]: string | undefined;
}

export function loadEnv(): Environment {
  const out: Record<string, string> = {};
  for (const file of ["../../.env", "../../.env.local"]) {
    try {
      const text = readFileSync(new URL(file, import.meta.url), "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m) out[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
      }
    } catch {
      // ignore missing
    }
  }
  return out;
}

export async function fetchApplications(env: Environment): Promise<Application[]> {
  const client = new ConvexHttpClient(env.CONVEX_URL);
  return (await client.query("applications:listAll", {})) as Application[];
}

export async function fetchApplicationById(
  env: Environment,
  id: string,
): Promise<Application | null> {
  const client = new ConvexHttpClient(env.CONVEX_URL);
  return (await client.query("applications:findById", { id })) as Application | null;
}

export async function fetchTags(env: Environment): Promise<Tag[]> {
  const client = new ConvexHttpClient(env.CONVEX_URL);
  return (await client.query("tags:listAll", {})) as Tag[];
}

const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
};

export async function downloadThumb(url: string, width = 480): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  const out = await sharp(Buffer.from(buf))
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

export async function resolveApplications(
  env: Environment,
  applications: Application[],
): Promise<Application[]> {
  const resolved = await mapLimit(applications, 6, (app) =>
    fetchApplicationById(env, app.id).catch(() => null),
  );
  return resolved.filter((a): a is Application => a !== null && !a.deletedAt);
}