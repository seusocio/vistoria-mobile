import {
  downloadThumb,
  fetchApplications,
  fetchTags,
  loadEnv,
  resolveApplications,
  type Application,
  type Tag,
} from "./data";
import { renderHtml, type FloorGroup, type ReportModel, type UnitReport } from "./html";
import { renderPdf, writeHtml } from "./pdf";
import { mkdirSync } from "node:fs";

interface Args {
  date: string;
  units: string[];
  outPrefix: string;
  inspector: string;
  client: string;
  docNo: string;
}

type HasFloor = UnitReport & { floor: number };

const DEFAULTS = {
  inspector: "Alyson Vilela",
  client: "Lollo Ganassali",
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    date: todayLocal(),
    units: [],
    outPrefix: "vistoria",
    inspector: DEFAULTS.inspector,
    client: DEFAULTS.client,
    docNo: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--date") args.date = next();
    else if (a === "--units") args.units = expandUnits(next());
    else if (a === "--out") args.outPrefix = next();
    else if (a === "--inspector") args.inspector = next();
    else if (a === "--client") args.client = next();
    else if (a === "--doc") args.docNo = next();
  }
  return args;
}

function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function range(from: number, to: number): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(String(i));
  return out;
}

function expandUnits(spec: string): string[] {
  return spec
    .split(",")
    .flatMap((part) => {
      const m = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
      return m ? range(Number(m[1]), Number(m[2])) : [part.trim()];
    })
    .filter(Boolean);
}

function formatBrDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function findUnitLabel(tags: Tag[], app: Application): string | null {
  const label = tags.find((t) => app.tagsIds.includes(t.id))?.label ?? null;
  if (label?.startsWith("APT-")) return label;
  return null;
}

function floorOf(label: string): number {
  const m = label.match(/^APT-(\d+)/);
  return m ? Math.floor(Number(m[1]) / 10) : 0;
}

function sortUnits(a: string, b: string): number {
  const num = (s: string) => {
    const m = s.match(/(\d+)$/);
    return m ? Number(m[1]) : Infinity;
  };
  return num(a) - num(b);
}

function groupByFloor(units: HasFloor[]): FloorGroup[] {
  const groups = new Map<number, UnitReport[]>();
  for (const u of units) {
    const arr = groups.get(u.floor) ?? [];
    arr.push(u);
    groups.set(u.floor, arr);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([floor, list]) => ({ floor, units: list }));
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();

  console.log(`Carregando dados do Convex… (${env.CONVEX_URL})`);
  const [applications, tags] = await Promise.all([fetchApplications(env), fetchTags(env)]);

  const wanted = new Set(args.units.map((u) => `APT-${u}`));
  const candidates = applications.filter(
    (a) =>
      a.date.startsWith(args.date) &&
      findUnitLabel(tags, a) &&
      (args.units.length === 0 || wanted.has(findUnitLabel(tags, a)!)),
  );

  console.log(`Resolvendo ${candidates.length} vistorias do dia ${args.date}…`);
  const resolved = await resolveApplications(env, candidates);

  const byUnit = new Map<string, Application>();
  for (const app of resolved) {
    const label = findUnitLabel(tags, app);
    if (label && !byUnit.has(label)) byUnit.set(label, app);
  }

  const units: HasFloor[] = [];
  let totalPhotos = 0;
  let totalChecked = 0;

  for (const label of [...byUnit.keys()].sort(sortUnits)) {
    const app = byUnit.get(label)!;
    const photos = app.attachments
      .filter((a) => a.url && a.deletedAt == null)
      .sort((a, b) => a.position - b.position);

    console.log(`   ${label}: ${photos.length} fotos, ${app.items.filter((i) => i.answer).length} itens`);
    const data = await Promise.all(
      photos.map((p) =>
        downloadThumb(p.url!).catch((e) => {
          console.warn(`      ! falha ao baixar ${p.id}: ${e.message}`);
          return "";
        }),
      ),
    );
    totalPhotos += photos.length;
    totalChecked += app.items.filter((i) => i.answer && i.deletedAt == null).length;
    units.push({ label, application: app, photos: data.filter(Boolean), floor: floorOf(label) });
  }

  const floors = groupByFloor(units);

  const docNo = args.docNo || `RD-${args.date.replace(/-/g, "")}`;

  const model: ReportModel = {
    generatedAt: new Date().toLocaleString("pt-BR"),
    date: args.date,
    dateLabel: formatBrDate(args.date),
    floors,
    totalPhotos,
    totalChecked,
    inspector: args.inspector,
    client: args.client,
    documentNo: docNo,
  };

  const html = renderHtml(model);
  const dir = new URL("../output/", import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });

  const htmlPath = `${dir}${args.outPrefix}-${args.date}.html`;
  const pdfPath = `${dir}${args.outPrefix}-${args.date}.pdf`;
  await writeHtml(html, htmlPath);

  console.log(`Renderizando PDF…`);
  await renderPdf(html, pdfPath);

  console.log("\nPronto!");
  console.log(`  HTML: ${htmlPath}`);
  console.log(`  PDF : ${pdfPath}`);
  const totalUnits = floors.reduce((acc, f) => acc + f.units.length, 0);
  console.log(`  ${totalUnits} unidades em ${floors.length} andares · ${totalPhotos} fotos · ${totalChecked} itens verificados`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});