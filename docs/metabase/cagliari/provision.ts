/**
 * Sobe o dashboard "Andamento CAGLIARI" para o Metabase, via API REST.
 *
 * Lê `standalone/manifesto.json` — produzido pelo `build.py` — e não
 * reinterpreta o SQL. O card declara o que ele é no front-matter de
 * `cards.sql`; aqui só se traduz isso para o vocabulário do Metabase.
 *
 * Idempotente: casa pelo nome do card e ATUALIZA, não duplica.
 *
 *   python3 docs/metabase/cagliari/build.py
 *   export MB_URL=https://meta.seusoc.io
 *   export MB_API_KEY=mb_...      # Admin → Settings → Authentication → API keys
 *   bun run docs/metabase/cagliari/provision.ts --database 2
 *   bun run docs/metabase/cagliari/provision.ts --database 2 --dry-run
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const MB_URL = (process.env.MB_URL || "").replace(/\/+$/, "");
const MB_API_KEY = process.env.MB_API_KEY || "";
const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const DRY = flag("dry-run");
const COLECAO = opt("collection") || "Andamento CAGLIARI";
const DASHBOARD = opt("dashboard") || "Andamento CAGLIARI";

if (!MB_URL || !MB_API_KEY) {
  console.error("Defina MB_URL e MB_API_KEY. Veja o cabeçalho deste arquivo.");
  process.exit(1);
}

async function mb(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${MB_URL}/api${path}`, {
    ...init,
    headers: { "x-api-key": MB_API_KEY, "content-type": "application/json", ...(init.headers || {}) },
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} → ${res.status} ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

/* ------------------------------------------------------------------ */
/* As três faixas. Uma cor por significado, em todo card empilhado.    */
/*                                                                     */
/* Âmbar para "falta", e não cinza: num card cujo ponto é ver o que    */
/* falta, cinza vira fundo e some.                                     */
/* ------------------------------------------------------------------ */
const COR: Record<string, string> = {
  "1 · já estava pronto": "#2A78D6",
  "2 · feito no período": "#1BAF7A",
  "3 · falta": "#EB6834",
  "1 · Já estava pronto": "#2A78D6",
  "2 · Feito no período": "#1BAF7A",
  "3 · Falta": "#EB6834",
};

/* ------------------------------------------------------------------ */
/* Os filtros do dashboard.                                            */
/*                                                                     */
/* Só as datas têm default, e de propósito: o Metabase marca variável  */
/* com default como `required: true`, o que faz o `[[AND ...]]` deixar */
/* de ser opcional — e aí dois filtros apontando para escopos          */
/* diferentes zeram o card em silêncio, sem erro nenhum. Sem default,  */
/* o dashboard abre na obra inteira e todo recorte é escolha explícita.*/
/* ------------------------------------------------------------------ */
type Filtro = { nome: string; tipo: "date" | "text"; dica?: string; default?: keyof Padroes };
const FILTROS: Record<string, Filtro> = {
  data_a:      { nome: "Início do período", tipo: "date", default: "data_a" },
  data_b:      { nome: "Fim do período",    tipo: "date", default: "data_b" },
  checklist_id:{ nome: "Checklist (id)",    tipo: "text", dica: "id do checklist" },
  tags:        { nome: "Tags",              tipo: "text", dica: "rótulos separados por vírgula: APT-11, APT-12" },
  pavimentos:  { nome: "Pavimentos",        tipo: "text", dica: "números separados por vírgula: 1,2,10" },
  prumadas:    { nome: "Prumadas",          tipo: "text", dica: "números separados por vírgula: 1,6" },
  servicos:    { nome: "Serviços",          tipo: "text", dica: "separados por vírgula: Soleira, Base shaft" },
  locais:      { nome: "Locais",            tipo: "text", dica: "separados por vírgula: WC, WCS" },
};

type Padroes = { data_a: string; data_b: string };
let PADROES: Padroes = { data_a: "", data_b: "" };

async function consultar(sql: string): Promise<any[][]> {
  const r = await mb("/dataset", {
    method: "POST",
    body: JSON.stringify({ type: "native", database: DB, native: { query: sql } }),
  });
  if (r.status === "failed") throw new Error(r.error);
  return r.data.rows;
}

/**
 * Os defaults de data saem do BANCO, não de uma constante.
 *
 * `data_b` = a última vistoria; `data_a` = a penúltima data distinta, para
 * que a faixa "já estava pronto" tenha conteúdo já na abertura. Um default
 * fixo tipo "30 dias atrás" cai antes de toda vistoria: aí tudo vira "feito
 * no período", a faixa azul zera e a pizza abre inteira verde.
 */
async function descobrirPadroes(): Promise<Padroes> {
  const datas = await consultar(
    `SELECT DISTINCT date::date FROM applications ORDER BY 1 DESC LIMIT 2`);
  return {
    data_b: String(datas[0]?.[0] ?? "").slice(0, 10),
    data_a: String(datas[1]?.[0] ?? datas[0]?.[0] ?? "").slice(0, 10),
  };
}

/* ---------------------- manifesto ---------------------- */
type Card = {
  id: string; arquivo: string; titulo: string; secao: string;
  viz: string; size: [number, number]; pergunta: string; pivot: string; variaveis: string[];
};
const CARDS: Card[] = JSON.parse(readFileSync(join(AQUI, "standalone", "manifesto.json"), "utf8"));
const sqlDo = (c: Card) =>
  readFileSync(join(AQUI, "standalone", c.arquivo), "utf8")
    .split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n").trim().replace(/;$/, "");

const uuid = () => crypto.randomUUID();
function templateTags(sql: string) {
  const tags: Record<string, unknown> = {};
  for (const m of sql.matchAll(/\{\{(\w+)\}\}/g)) {
    const nome = m[1];
    if (tags[nome]) continue;
    const f = FILTROS[nome];
    if (!f) throw new Error(`variável {{${nome}}} sem definição em FILTROS`);
    const padrao = f.default ? PADROES[f.default] : undefined;
    tags[nome] = {
      id: uuid(), name: nome, "display-name": f.nome, type: f.tipo,
      ...(padrao ? { default: padrao, required: true } : {}),
    };
  }
  return tags;
}

/**
 * O `viz:` do front-matter para o `display` do Metabase.
 *
 * `heatmap` e `heatmap_falta` não são displays do Metabase: são tabelas com
 * escala de cor. O nome existe no front-matter para dizer a INTENÇÃO do
 * card; a tradução para o vocabulário do Metabase é aqui.
 */
const DISPLAY: Record<string, string> = {
  heatmap: "table",
  heatmap_falta: "table",
};
const displayDe = (viz: string) => DISPLAY[viz] ?? viz;

/** Traduz o front-matter do card para `visualization_settings`. */
function visualizacao(c: Card, cols: any[]): Record<string, unknown> {
  // `pivot-grouping` é uma coluna que o próprio Metabase injeta; não é nossa
  const nossas = cols.filter((x: any) => x.name !== "pivot-grouping");
  const nomes = nossas.map((x: any) => x.display_name ?? x.name);
  const series = Object.fromEntries(
    nomes.filter((n: string) => COR[n]).map((n: string) => [n, { color: COR[n] }]));

  const conhecidos = ["table", "pie", "line", "row", "bar", "heatmap", "heatmap_falta"];
  if (!conhecidos.includes(c.viz)) {
    throw new Error(`card "${c.titulo}": viz "${c.viz}" desconhecido. ` +
      `Use um de: ${conhecidos.join(", ")}.`);
  }

  switch (c.viz) {
    case "pie":
      return {
        "pie.dimension": nomes[0], "pie.metric": nomes[1],
        "pie.colors": Object.fromEntries(
          nomes.filter((n: string) => COR[n]).map((n: string) => [n, COR[n]])),
      };
    case "line":
      return {
        "graph.dimensions": [nomes[0]],
        "graph.metrics": ["pct_concluido"],
        "graph.y_axis.auto_range": false,
        "graph.y_axis.min": 0, "graph.y_axis.max": 100,
        series_settings: { pct_concluido: { color: "#1BAF7A" } },
      };
    case "row":
    case "bar":
      return {
        "stackable.stack_type": "stacked",
        "graph.show_values": true,
        // Sem isto o Metabase junta as categorias além das 8 primeiras num
        // balde "Other (N)" — no card "Por serviço" isso escondia 2 dos 10
        // serviços, e o balde não diz quais são nem serve para agir.
        "graph.max_categories_enabled": false,
        "graph.max_categories": 0,
        ...(Object.keys(series).length ? { series_settings: series } : {}),
      };
    // `heatmap` / `heatmap_falta`: tabela com escala de cor nas células.
    //
    // NÃO existe `display: "pivot"` aqui de propósito. O Metabase só faz
    // pivot em pergunta montada no query builder; numa pergunta nativa a
    // UI responde "Pivot tables are only supported for questions built in
    // the query builder" e o card não renderiza. A transposição é feita no
    // SQL do card, e aqui só se pinta a grade.
    case "heatmap":
    case "heatmap_falta": {
      // A primeira coluna é o rótulo da linha; as demais são a grade.
      const celulas = nomes.slice(1);
      // verde = bom. Em `heatmap` a célula é % concluído (alto é bom);
      // em `heatmap_falta` é quantidade pendente (alto é ruim) — a escala
      // inverte, senão a cor mente sobre o que está lendo.
      const escala = c.viz === "heatmap"
        ? ["#EB6834", "#1BAF7A"]
        : ["#1BAF7A", "#EB6834"];
      return {
        "table.column_formatting": celulas.map((col: string, i: number) => ({
          id: i,
          type: "range",
          columns: [col],
          colors: escala,
          ...(c.viz === "heatmap"
            ? { min_type: "custom", min_value: 0, max_type: "custom", max_value: 100 }
            : { min_type: "custom", min_value: 0, max_type: "all" }),
        })),
      };
    }
    default:
      return {};
  }
}

/* ---------------------- main ---------------------- */
if (flag("list-databases")) {
  const dbs = await mb("/database");
  for (const d of (dbs.data ?? dbs)) console.log(`  id=${d.id}  ${d.name}  (${d.engine})`);
  process.exit(0);
}

const DB = Number(opt("database"));
if (!DB) { console.error("Faltou --database <id>. Rode com --list-databases."); process.exit(1); }

PADROES = await descobrirPadroes();
console.log(`período padrão, tirado do banco: ${PADROES.data_a} → ${PADROES.data_b}`);
console.log(`${CARDS.length} cards · banco ${DB} · coleção "${COLECAO}"${DRY ? " · DRY RUN" : ""}\n`);

if (DRY) {
  let secao = "";
  for (const c of CARDS) {
    if (c.secao !== secao) { secao = c.secao; console.log(`  ── ${secao}`); }
    console.log(`     ${c.viz.padEnd(6)} ${c.titulo.padEnd(28)} ${c.variaveis.join(", ")}`);
  }
  process.exit(0);
}

// coleção
const colecoes = await mb("/collection");
let col = colecoes.find((c: any) => c.name === COLECAO);
if (!col) {
  col = await mb("/collection", { method: "POST", body: JSON.stringify({ name: COLECAO, parent_id: null }) });
  console.log(`coleção criada (id ${col.id})`);
} else console.log(`coleção existente (id ${col.id})`);

const existentes: any[] = (await mb(`/collection/${col.id}/items?models=card`)).data ?? [];
const porNome = new Map(existentes.map((c: any) => [c.name, c.id]));

const idNoMetabase = new Map<string, number>();
for (const c of CARDS) {
  const sql = sqlDo(c);
  const corpo = {
    name: c.titulo,
    description: c.pergunta || undefined,
    display: displayDe(c.viz),
    visualization_settings: {},   // preenchido abaixo, depois de saber as colunas
    collection_id: col.id,
    dataset_query: { type: "native", database: DB, native: { query: sql, "template-tags": templateTags(sql) } },
  };
  const id = porNome.get(c.titulo);
  const salvo = id
    ? await mb(`/card/${id}`, { method: "PUT", body: JSON.stringify(corpo) })
    : await mb("/card", { method: "POST", body: JSON.stringify(corpo) });
  idNoMetabase.set(c.id, salvo.id);

  // As cores e o pivot dependem das COLUNAS e dos seus tipos, que só se
  // conhecem rodando o card. Roda uma vez e salva de novo com a
  // visualização certa.
  //
  // De propósito NÃO se manda `result_metadata` de volta: num card com
  // `display: pivot` o `results_metadata` que o Metabase devolve vem
  // desalinhado (traz o `pivot-grouping` e desloca os tipos — `prumada`
  // chega como Decimal). Metadado errado é pior que nenhum; deixado de
  // fora, o Metabase o recalcula sozinho na próxima execução.
  const r = await mb(`/card/${salvo.id}/query`, { method: "POST", body: "{}" });
  if (r?.status !== "completed") {
    throw new Error(`card "${c.titulo}" não executa: ${String(r?.error).slice(0, 200)}`);
  }
  const cols: any[] = r.data.cols ?? [];
  const vs = visualizacao(c, cols);
  if (Object.keys(vs).length) {
    await mb(`/card/${salvo.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...corpo, visualization_settings: vs }),
    });
  }
  console.log(`  ${id ? "atualizado" : "criado   "}  ${c.viz.padEnd(14)} ${c.titulo}`);
}

// dashboard
const dashs: any[] = (await mb(`/collection/${col.id}/items?models=dashboard`)).data ?? [];
let did = dashs.find((d: any) => d.name === DASHBOARD)?.id;
if (!did) did = (await mb("/dashboard", { method: "POST", body: JSON.stringify({ name: DASHBOARD, collection_id: col.id }) })).id;

const usadas = [...new Set(CARDS.flatMap(c => c.variaveis))]
  .sort((a, b) => Object.keys(FILTROS).indexOf(a) - Object.keys(FILTROS).indexOf(b));
const paramId = (n: string) => n.slice(0, 8).padEnd(8, "0");
const parameters = usadas.map(n => {
  const f = FILTROS[n];
  return f.tipo === "date"
    ? { id: paramId(n), name: f.nome, slug: n, type: "date/single", sectionId: "date" }
    : { id: paramId(n), name: f.nome, slug: n, type: "category", sectionId: "string" };
});

// Layout: empacota da esquerda para a direita numa grade de 24 colunas,
// quebrando quando o próximo card não cabe. Cada seção abre com um card de
// texto — sem divisória, 15 cards viram uma parede.
let linha = 0, coluna = 0, alturaDaLinha = 0, nid = 0;
const dashcards: any[] = [];
let secaoAtual = "";
for (const c of CARDS) {
  if (c.secao !== secaoAtual) {
    secaoAtual = c.secao;
    if (coluna > 0) { linha += alturaDaLinha; coluna = 0; alturaDaLinha = 0; }
    dashcards.push({
      id: --nid, card_id: null, row: linha, col: 0, size_x: 24, size_y: 2,
      visualization_settings: {
        virtual_card: { display: "text", archived: false, dataset_query: {}, visualization_settings: {} },
        text: `## ${c.secao}`,
      },
      parameter_mappings: [],
    });
    linha += 2;
  }
  const [sx, sy] = c.size;
  if (coluna + sx > 24) { linha += alturaDaLinha; coluna = 0; alturaDaLinha = 0; }
  dashcards.push({
    id: --nid,
    card_id: idNoMetabase.get(c.id),
    row: linha, col: coluna, size_x: sx, size_y: sy,
    parameter_mappings: c.variaveis.map(n => ({
      parameter_id: paramId(n),
      card_id: idNoMetabase.get(c.id),
      target: ["variable", ["template-tag", n]],
    })),
    visualization_settings: {},
  });
  coluna += sx;
  alturaDaLinha = Math.max(alturaDaLinha, sy);
}

await mb(`/dashboard/${did}`, { method: "PUT", body: JSON.stringify({ dashcards, parameters }) });
console.log(`\ndashboard  ${DASHBOARD}  ·  ${CARDS.length} cards  ·  ${parameters.length} filtros`);
console.log(`${MB_URL}/dashboard/${did}`);
