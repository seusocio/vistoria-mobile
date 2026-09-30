/**
 * Cria no Metabase, via API REST: uma coleção, todas as perguntas nativas de
 * `standalone/` e os 6 dashboards com os cards já posicionados.
 *
 * Idempotente: roda de novo e ele ATUALIZA o que já existe (casa pelo nome),
 * em vez de duplicar.
 *
 * Uso:
 *   export MB_URL=https://meta.seusoc.io
 *   export MB_API_KEY=mb_xxxxxxxx        # Admin → Settings → Authentication → API keys
 *   bun run docs/metabase/provision.ts --list-databases   # descobre o id do banco
 *   bun run docs/metabase/provision.ts --database 2 --dry-run
 *   bun run docs/metabase/provision.ts --database 2
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MB_URL = (process.env.MB_URL || "").replace(/\/+$/, "");
const MB_API_KEY = process.env.MB_API_KEY || "";
const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const DRY = flag("dry-run");
const COLLECTION = opt("collection") || "Vistoria — Produção";

if (!MB_URL || !MB_API_KEY) {
  console.error("Defina MB_URL e MB_API_KEY. Veja o cabeçalho deste arquivo.");
  process.exit(1);
}

async function mb(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${MB_URL}/api${path}`, {
    ...init,
    headers: {
      "x-api-key": MB_API_KEY,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/* ---------------- tipos de visualização por card ---------------- */
// `size` é [largura, altura] na grade de 24 colunas do Metabase. Sem ele o
// card cai no padrão de meia largura (12 × 6).
type Viz = { display: string; settings?: Record<string, unknown>; size?: [number, number] };
const STACK = { "stackable.stack_type": "stacked" };
const VIZ: Record<string, Viz> = {
  "1.1": { display: "table" },
  "1.2": { display: "bar", settings: STACK },
  "1.3": { display: "line" },
  "1.4": { display: "row" },
  "1.5": { display: "table" },
  "1.6": { display: "table" },
  "1.7": { display: "bar" },
  "1.8": { display: "table" },
  "2.1": { display: "table" },
  "2.2": { display: "bar", settings: STACK },
  "2.3": { display: "table" },
  "2.4": { display: "row" },
  "2.5": { display: "table" },
  "2.6": { display: "row" },
  "2.7": { display: "table" },
  "3.1": { display: "table" },
  "3.2": { display: "line" },
  "3.3": { display: "table" },
  "3.4": { display: "table" },
  "3.5": { display: "table" },
  "3.6": { display: "row" },
  "3.7": { display: "table" },
  "4.1": { display: "row" },
  "4.2": { display: "row" },
  "4.3": { display: "row" },
  "4.4": { display: "table" },
  "4.5": { display: "row" },
  "4.6": { display: "table" },
  "4.7": { display: "table" },
  "4.8": { display: "table" },
  "5.1": { display: "table" },
  "5.2": { display: "table" },
  "5.3": { display: "table" },
  "5.4": { display: "row" },
  "5.5": { display: "row" },
  "5.6": { display: "bar", settings: STACK },
  "5.7": { display: "table" },
  "5.8": { display: "row" },
  // a barra de obra: empilhada, com as três cores que você definiu
  "6.1": {
    display: "row",
    settings: {
      ...STACK,
      "series_settings": {
        "1 · feito até A": { color: "#EB6834" },
        "2 · avanço A→B": { color: "#2A78D6" },
        "3 · falta": { color: "#D7DAE0" },
      },
      "graph.y_axis.auto_range": false,
      "graph.y_axis.min": 0,
      "graph.y_axis.max": 100,
    },
  },
  "6.2": {
    display: "row",
    settings: {
      ...STACK,
      "series_settings": {
        "1 · feito antes": { color: "#EB6834" },
        "2 · avanço": { color: "#2A78D6" },
        "3 · falta": { color: "#D7DAE0" },
      },
    },
  },
  "6.3": { display: "table" },
  "6.4": { display: "line", settings: STACK },
  "6.5": { display: "table" },
  // --- andamento cumulativo (arquivo 10) ---
  // Duas pizzas: 10.1 no escopo do checklist, 10.2 no escopo da frente.
  "10.1": { display: "pie", settings: {
      "pie.dimension": "faixa", "pie.metric": "itens",
      "pie.colors": {
        "1 · Feito antes": "#2A78D6",
        "2 · Feito no período": "#1BAF7A",
        "3 · Falta": "#D7DAE0",
      },
    } },
  "10.2": { display: "pie", settings: {
      "pie.dimension": "faixa", "pie.metric": "itens",
      "pie.colors": {
        "1 · Feito antes": "#2A78D6",
        "2 · Feito no período": "#1BAF7A",
        "3 · Falta": "#D7DAE0",
      },
    } },
  "10.3": {
    display: "row",
    settings: {
      ...STACK,
      series_settings: {
        "1 · feito antes": { color: "#2A78D6" },
        "2 · feito no período": { color: "#1BAF7A" },
        "3 · falta": { color: "#D7DAE0" },
      },
    },
  },
  "10.4": { display: "line" },
  "10.5": { display: "table" },
  "10.6": { display: "table" },
  "10.7": { display: "table" },
  "10.8": {
    display: "row",
    settings: {
      ...STACK,
      series_settings: {
        "feito no período": { color: "#1BAF7A" },
        "falta": { color: "#EB6834" },
        "já estava pronto": { color: "#2A78D6" },
      },
      "graph.show_values": true,
    },
  },
  "10.9": { display: "table" },
  "10.10": { display: "table" },
  "10.11": {
    display: "row",
    settings: {
      series_settings: { falta: { color: "#EB6834" } },
      "graph.show_values": true,
    },
  },
  // Gantt: barra empilhada com a primeira série pintada do branco do fundo.
  "10.12": {
    display: "row",
    settings: {
      ...STACK,
      series_settings: { espera: { color: "#FFFFFF" }, "duração": { color: "#2A78D6" } },
    },
  },
  "10.13": {
    display: "row",
    settings: {
      ...STACK,
      series_settings: { espera: { color: "#FFFFFF" }, "duração": { color: "#1BAF7A" } },
    },
  },
  "10.14": { display: "table" },
  "10.15": {
    display: "row",
    settings: { series_settings: { falta: { color: "#EB6834" } }, "graph.show_values": true },
  },
  "10.16": {
    display: "row",
    settings: { series_settings: { falta: { color: "#EB6834" } }, "graph.show_values": true },
  },
  "10.17": { display: "table" },
  "10.18": { display: "table" },
  "10.19": { display: "table" },
  "10.20": { display: "table" },
  "10.21": { display: "table" },
  "10.22": { display: "table" },
  "10.23": { display: "table" },
  // --- levantamento de obra (arquivo 11) ---
  // As três faixas têm sempre as mesmas cores, em todo card empilhado:
  //   azul  #2A78D6  já estava pronto
  //   verde #1BAF7A  feito no período
  //   âmbar #EB6834  falta   (cinza aqui seria invisível — é o que importa ver)
  "11.1": { display: "table", size: [24, 3] },   // placar: faixa fina, largura inteira
  "11.2": { display: "pie", settings: {
      "pie.dimension": "faixa", "pie.metric": "itens",
      "pie.colors": {
        "1 · Já estava pronto": "#2A78D6",
        "2 · Feito no período": "#1BAF7A",
        "3 · Falta": "#EB6834",
      },
    } },
  "11.3": { display: "line", settings: {
      "graph.dimensions": ["dia"],
      "graph.metrics": ["pct_concluido"],
      "graph.y_axis.auto_range": false,
      "graph.y_axis.min": 0,
      "graph.y_axis.max": 100,
      series_settings: { pct_concluido: { color: "#1BAF7A" } },
    } },
  "11.4": { display: "table", size: [24, 6] },
  // Os quatro eixos de agrupamento, a mesma barra empilhada nos quatro.
  "11.5": { display: "row", settings: { ...STACK, "graph.show_values": true,
      series_settings: {
        "1 · já estava pronto": { color: "#2A78D6" },
        "2 · feito no período": { color: "#1BAF7A" },
        "3 · falta": { color: "#EB6834" },
      } } },
  "11.6": { display: "row", settings: { ...STACK, "graph.show_values": true,
      series_settings: {
        "1 · já estava pronto": { color: "#2A78D6" },
        "2 · feito no período": { color: "#1BAF7A" },
        "3 · falta": { color: "#EB6834" },
      } } },
  "11.7": { display: "row", size: [24, 7], settings: { ...STACK,
      series_settings: {
        "1 · já estava pronto": { color: "#2A78D6" },
        "2 · feito no período": { color: "#1BAF7A" },
        "3 · falta": { color: "#EB6834" },
      } } },
  "11.8": { display: "table", size: [24, 8] },   // os 30 itens, sem rolagem horizontal
  // Pivot: serviço nas linhas, local nas colunas, `falta` na célula.
  "11.9": { display: "pivot", size: [24, 7], settings: {
      "pivot_table.column_split": {
        rows: ["servico"], columns: ["local"], values: ["falta"],
      },
    } },
  "11.10": { display: "table", size: [12, 7] },
  "11.11": { display: "table", size: [12, 7] },
  "11.12": { display: "table", size: [24, 8] },  // a lista de campo
};

/* ---------------- variáveis ({{data_a}} etc) ---------------- */
// Os defaults saem do próprio banco (descobrirDefaults). Um default fixo como
// "30 dias atrás" cai antes de toda vistoria e deixa a faixa azul sempre em
// zero — foi exatamente o que aconteceu na primeira versão.
type Defaults = { data_a: string; data_b: string };
let DEFAULTS: Defaults = { data_a: "", data_b: "" };

async function queryDb(sql: string): Promise<any[][]> {
  const r = await mb("/dataset", {
    method: "POST",
    body: JSON.stringify({ type: "native", database: DB, native: { query: sql } }),
  });
  if (r.status === "failed") throw new Error(r.error);
  return r.data.rows;
}

async function descobrirDefaults(): Promise<Defaults> {
  // data_b = última vistoria; data_a = a penúltima data distinta, para que
  // "já estava pronto" tenha conteúdo de verdade já na abertura do dashboard.
  // Um default fixo como "30 dias atrás" cai antes de TODA vistoria: aí tudo
  // vira "feito no período", a faixa azul zera e a pizza abre inteira verde.
  // Foi o que aconteceu na primeira versão. Por isso os defaults saem daqui.
  const datas = await queryDb(
    `SELECT DISTINCT date::date FROM applications ORDER BY 1 DESC LIMIT 2`);
  const data_b = String(datas[0]?.[0] ?? "").slice(0, 10);
  const data_a = String(datas[1]?.[0] ?? datas[0]?.[0] ?? "").slice(0, 10);
  return { data_a, data_b };
}

const TAGS: Record<string, { type: string; display: string; def?: keyof Defaults }> = {
  data_a: { type: "date", display: "Início do período", def: "data_a" },
  data_b: { type: "date", display: "Fim do período", def: "data_b" },
  checklist: { type: "text", display: "Checklist" },
  frente: { type: "text", display: "Frente (apartamento)" },
  servico: { type: "text", display: "Serviço" },
  local: { type: "text", display: "Local" },
};

// Só as datas ganham default, e de propósito. O Metabase marca toda variável
// com default como `required: true`, e uma variável obrigatória faz o
// `[[AND ...]]` deixar de ser opcional: escolher uma frente de um checklist e
// um serviço que não existe nela zerava o card SEM erro nenhum. Sem default,
// frente/serviço/local são de fato opcionais — o dashboard abre na obra
// inteira e o recorte passa a ser escolha explícita de quem está olhando.
// As datas precisam de default porque as três faixas dependem delas.

const uuid = () => crypto.randomUUID();
function templateTags(sql: string) {
  const tags: Record<string, unknown> = {};
  for (const m of sql.matchAll(/\{\{(\w+)\}\}/g)) {
    const name = m[1];
    if (tags[name]) continue;
    const t = TAGS[name] || { type: "text", display: name };
    const def = (t as any).def ? DEFAULTS[(t as any).def as keyof Defaults] : undefined;
    tags[name] = {
      id: uuid(), name, "display-name": t.display, type: t.type,
      ...(def ? { default: def, required: true } : {}),
    };
  }
  return tags;
}

/* ---------------- cabeçalhos de seção ---------------- */
// Texto solto no dashboard, inserido ANTES do card indicado. Um dashboard de
// 12 cards sem divisória vira uma parede; estes títulos são as perguntas que
// o dashboard existe para responder, na ordem em que se lê.
const SECOES: Record<string, string> = {
  "11.1": "## Quando · o retrato da obra\nQuanto já estava pronto, quanto andou no período, quanto falta — e em que data a obra andou.",
  "11.5": "## Qual · quantos · quanto falta · %\nA mesma decomposição nos quatro eixos: serviço, local, apartamento e item do checklist. A coluna `previsto` soma o mesmo total nos quatro.",
  "11.9": "## Onde\nO mapa dos buracos, quais apartamentos, e a lista para levar a campo.",
};

/* ---------------- lê os cards dos arquivos ---------------- */
const SHEET_NAMES: Record<string, string> = {
  "01": "Operação diária",
  "02": "Produtividade por pessoa",
  "03": "Evolução por tag",
  "04": "Qualidade e conformidade",
  "05": "Saúde do catálogo",
  "06": "Barra de evolução de obra",
  "10": "Andamento de obra",
  "11": "Levantamento de obra",
};
type Card = { key: string; title: string; sql: string; sheet: string; sheetName: string };
function loadCards(): Card[] {
  const out: Card[] = [];
  const files = readdirSync(join(HERE, "standalone")).filter(f => /^\d\d-.*\.sql$/.test(f)).sort();
  for (const f of files) {
    const text = readFileSync(join(HERE, "standalone", f), "utf8");
    const sheetName = SHEET_NAMES[f.slice(0, 2)]
      ?? (text.match(/^-- (DASHBOARD .+)$/m)?.[1] || f)
        .replace(/^DASHBOARD \d+ — /, "").replace(/\s+\(.*\)\s*$/, "").trim();
    for (const chunk of text.split(/\n(?=-- @card )/).slice(1)) {
      const head = chunk.match(/^-- @card ([\d.]+) — ([^\n(·]+)/);
      if (!head) continue;
      const key = head[1];
      const sql = chunk.split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n").trim().replace(/;$/, "");
      if (!sql || !VIZ[key]) continue;
      out.push({ key, title: `${key} · ${head[2].trim()}`, sql, sheet: f.slice(0, 2), sheetName });
    }
  }
  return out;
}

/* ---------------- main ---------------- */
if (flag("list-databases")) {
  const dbs = await mb("/database");
  for (const d of (dbs.data ?? dbs)) console.log(`  id=${d.id}  ${d.name}  (${d.engine})`);
  process.exit(0);
}

const DB = Number(opt("database"));
if (!DB) { console.error("Faltou --database <id>. Rode com --list-databases."); process.exit(1); }

// O dashboard 2 depende de applications.created_by, que ainda não existe no
// banco. Provisionar geraria 7 cards quebrados; fica de fora até a migração.
// Para incluí-lo depois da migração: --include-pessoas
const SKIP_SHEETS = flag("include-pessoas") ? [] : ["02"];
const ONLY = (opt("only") || "").split(",").map(s => s.trim()).filter(Boolean);
DEFAULTS = await descobrirDefaults();
console.log(`defaults tirados do banco: ${JSON.stringify(DEFAULTS)}\n`);
const cards = loadCards()
  .filter(c => !SKIP_SHEETS.includes(c.sheet))
  .filter(c => ONLY.length === 0 || ONLY.includes(c.sheet));
if (ONLY.length) console.log(`só os arquivos: ${ONLY.join(", ")}\n`);
else if (SKIP_SHEETS.length) console.log("pulando dashboard 02 (precisa da coluna created_by)\n");
console.log(`${cards.length} cards lidos · banco ${DB} · coleção "${COLLECTION}"${DRY ? " · DRY RUN" : ""}\n`);

if (DRY) {
  const bySheet = new Map<string, Card[]>();
  cards.forEach(c => bySheet.set(c.sheet, [...(bySheet.get(c.sheet) || []), c]));
  for (const [sheet, cs] of bySheet) {
    console.log(`dashboard ${sheet} — ${cs[0].sheetName}`);
    cs.forEach(c => console.log(`   ${VIZ[c.key].display.padEnd(6)} ${c.title}`));
  }
  process.exit(0);
}

// coleção
const cols = await mb("/collection");
let col = cols.find((c: any) => c.name === COLLECTION);
if (!col) { col = await mb("/collection", { method: "POST", body: JSON.stringify({ name: COLLECTION, parent_id: null }) }); console.log(`coleção criada (id ${col.id})`); }
else console.log(`coleção existente (id ${col.id})`);

// cards existentes nessa coleção
const existing: any[] = (await mb(`/collection/${col.id}/items?models=card`)).data ?? [];
const byName = new Map(existing.map((c: any) => [c.name, c.id]));

const made = new Map<string, number>();
for (const c of cards) {
  const body = {
    name: c.title,
    display: VIZ[c.key].display,
    visualization_settings: VIZ[c.key].settings ?? {},
    collection_id: col.id,
    dataset_query: {
      type: "native",
      database: DB,
      native: { query: c.sql, "template-tags": templateTags(c.sql) },
    },
  };
  const id = byName.get(c.title);
  const saved = id
    ? await mb(`/card/${id}`, { method: "PUT", body: JSON.stringify(body) })
    : await mb("/card", { method: "POST", body: JSON.stringify(body) });
  made.set(c.key, saved.id);
  console.log(`  ${id ? "atualizado" : "criado   "}  ${c.title}`);
}

// dashboards
const dashItems: any[] = (await mb(`/collection/${col.id}/items?models=dashboard`)).data ?? [];
const dashByName = new Map(dashItems.map((d: any) => [d.name, d.id]));
const sheets = [...new Set(cards.map(c => c.sheet))];

for (const sheet of sheets) {
  const cs = cards.filter(c => c.sheet === sheet);
  const name = `${sheet} · ${cs[0].sheetName}`;
  let did = dashByName.get(name);
  if (!did) did = (await mb("/dashboard", { method: "POST", body: JSON.stringify({ name, collection_id: col.id }) })).id;

  // filtros do dashboard, a partir das variáveis {{...}} usadas pelos cards
  const tagsNoSheet = [...new Set(cs.flatMap(c => [...c.sql.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1])))];
  const paramId = (n: string) => n.slice(0, 8).padEnd(8, "0");
  const parameters = tagsNoSheet.map(n => {
    const t = TAGS[n] || { type: "text", display: n };
    return t.type === "date"
      ? { id: paramId(n), name: t.display, slug: n, type: "date/single", sectionId: "date" }
      : { id: paramId(n), name: t.display, slug: n, type: "category", sectionId: "string" };
  });

  // Layout: empacota os cards da esquerda para a direita numa grade de 24
  // colunas, quebrando a linha quando o próximo não cabe. Um card sem `size`
  // ocupa meia largura (12 × 6); com `size`, o que pediu.
  let gridRow = 0, gridCol = 0, alturaDaLinha = 0;
  let nid = 0;
  const dashcards: any[] = [];
  const quebraLinha = () => {
    if (gridCol > 0) { gridRow += alturaDaLinha; gridCol = 0; alturaDaLinha = 0; }
  };
  for (const c of cs) {
    const texto = SECOES[c.key];
    if (texto) {
      quebraLinha();
      dashcards.push({
        id: --nid, card_id: null, row: gridRow, col: 0, size_x: 24, size_y: 2,
        visualization_settings: { virtual_card: { display: "text", archived: false,
          dataset_query: {}, visualization_settings: {} }, text: texto },
        parameter_mappings: [],
      });
      gridRow += 2;
    }
    const usadas = [...new Set([...c.sql.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))];
    const [sx, sy] = VIZ[c.key].size ?? [12, 6];
    if (gridCol + sx > 24) { gridRow += alturaDaLinha; gridCol = 0; alturaDaLinha = 0; }
    const pos = { row: gridRow, col: gridCol };
    gridCol += sx;
    alturaDaLinha = Math.max(alturaDaLinha, sy);
    dashcards.push({
      id: --nid,
      card_id: made.get(c.key),
      row: pos.row,
      col: pos.col,
      size_x: sx,
      size_y: sy,
      parameter_mappings: usadas.map(n => ({
        parameter_id: paramId(n),
        card_id: made.get(c.key),
        target: ["variable", ["template-tag", n]],
      })),
      visualization_settings: {},
    });
  }
  await mb(`/dashboard/${did}`, { method: "PUT", body: JSON.stringify({ dashcards, parameters }) });
  const filtros = parameters.length ? `  · ${parameters.length} filtro(s)` : "";
  console.log(`dashboard  ${name}  (${cs.length} cards)${filtros}  ${MB_URL}/dashboard/${did}`);
}
console.log(`\npronto → ${MB_URL}/collection/${col.id}`);
