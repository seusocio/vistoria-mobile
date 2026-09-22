import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { readFileSync } from "node:fs";

const env = dotenv();
const client = new ConvexHttpClient(env.CONVEX_URL);
const byId = (await client.query(
  makeFunctionReference<"query">("applications:findById"),
  { id: "application_mu2ltkhakd8k4e3m5v" },
)) as { attachments: Array<{ id: string; url?: string }> };
console.log("resolved urls", byId.attachments.slice(0, 3).map((a) => a.url));
for (const url of byId.attachments.slice(0, 2).map((a) => a.url)) {
  if (!url) continue;
  const res = await fetch(url);
  console.log("FETCH", res.status, res.headers.get("content-type"), (await res.arrayBuffer()).byteLength, "bytes", url);
}

function dotenv() {
  const out: Record<string, string> = {};
  for (const file of ["../../.env", "../../.env.local"]) {
    try {
      const text = readFileSync(new URL(file, import.meta.url), "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m) out[m[1]] = m[2].trim();
      }
    } catch {}
  }
  return out;
}