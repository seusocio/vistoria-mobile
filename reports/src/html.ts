import type { Application } from "./data";

export interface UnitReport {
  label: string;
  application: Application;
  photos: string[];
}

export interface FloorGroup {
  floor: number;
  units: UnitReport[];
}

export interface ReportModel {
  generatedAt: string;
  date: string;
  dateLabel: string;
  floors: FloorGroup[];
  totalPhotos: number;
  totalChecked: number;
  inspector: string;
  client: string;
  documentNo: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const answerClass = (answer: string) => {
  const a = answer.toLowerCase();
  if (["sim", "ok", "feito", "concluído", "concluido", "positivo", "aprovado"].includes(a)) return "good";
  if (["não", "nao", "negativo", "pendente"].includes(a)) return "bad";
  if (["parcial", "neutro"].includes(a)) return "warn";
  return "neut";
};

const answerLabel = (answer: string) => {
  const a = answer.toLowerCase();
  if (["sim", "ok", "feito", "concluído", "concluido", "positivo", "aprovado"].includes(a)) return "Aprovado";
  if (["não", "nao", "negativo", "pendente"].includes(a)) return "Não aprovado";
  if (["parcial", "neutro"].includes(a)) return "Parcial";
  return answer || "—";
};

function unitCard(unit: UnitReport): string {
  const app = unit.application;
  const answered = app.items.filter((i) => i.answer && i.deletedAt == null);
  const statusLabel = app.status === "completed" ? "Concluído" : "Rascunho";
  const statusClass = app.status === "completed" ? "done" : "draft";
  const completedAt = app.completedAt ? new Date(app.completedAt) : null;
  const timeLabel = completedAt
    ? completedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";

  const checklistRows = answered
    .map(
      (item) => `
      <tr>
        <td class="idx">${item.position + 1}</td>
        <td class="check-title">${esc(item.title)}</td>
        <td class="check-note">${esc(item.note || "")}</td>
        <td class="qty">${item.quantity != null ? esc(String(item.quantity)) : ""}</td>
        <td class="answer"><span class="stamp ${answerClass(item.answer)}">${esc(answerLabel(item.answer))}</span></td>
      </tr>`,
    )
    .join("");

  const checklist = answered.length
    ? `<table class="checklist">
         <thead>
           <tr><th>#</th><th>Item verificado</th><th>Observação</th><th>Qtd.</th><th>Resultado</th></tr>
         </thead>
         <tbody>${checklistRows}</tbody>
       </table>`
    : "";

  const grid = unit.photos.length
    ? `<div class="grid">${unit.photos.map((p) => `<img src="${p}" alt="" />`).join("")}</div>`
    : `<p class="empty">Sem fotos registradas.</p>`;

  return `
  <section class="unit">
    <div class="unit-head">
      <div class="unit-title">
        <span class="apt">${esc(unit.label)}</span>
        <span class="status status-${statusClass}">${statusLabel}${timeLabel ? ` · ${timeLabel}` : ""}</span>
      </div>
      <div class="unit-meta">
        ${answered.length ? `<span>${answered.length} item(ns) verificado(s)</span><span class="dot-sep"></span>` : ""}
        <span>${unit.photos.length} foto(s)</span>
      </div>
    </div>
    ${checklist}
    ${grid}
  </section>`;
}

export function renderHtml(model: ReportModel): string {
  const totalUnits = model.floors.reduce((acc, f) => acc + f.units.length, 0);
  const sections = model.floors
    .map(
      (floor) => `
      <section class="floor">
        <h2 class="floor-title">Andar ${floor.floor}</h2>
        ${floor.units.map(unitCard).join("\n")}
      </section>`,
    )
    .join("\n");

  const metaRow = (label: string, value: string) => `
    <div class="kv">
      <span class="k">${esc(label)}</span>
      <span class="v">${esc(value)}</span>
    </div>`;

  const metadataTable = `
    <table class="meta">
      <tbody>
        <tr>
          <td class="meta-cell">${metaRow("Documento", model.documentNo)}</td>
          <td class="meta-cell">${metaRow("Data", model.dateLabel)}</td>
        </tr>
        <tr>
          <td class="meta-cell">${metaRow("Cliente", model.client)}</td>
          <td class="meta-cell">${metaRow("Feito por", model.inspector)}</td>
        </tr>
        <tr>
          <td class="meta-cell">${metaRow("Natureza", "Vistoria de obra")}</td>
          <td class="meta-cell">${metaRow("Unidades inspecionadas", String(totalUnits))}</td>
        </tr>
      </tbody>
    </table>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${esc(model.documentNo)} — ${esc(model.date)}</title>
<style>
  :root {
    --ink: #161616;
    --muted: #5f5f5f;
    --line: #dadada;
    --brand: #161616;
    --brand-soft: #efefef;
    --accent: #161616;
    --good: #1c7c54;
    --bad: #b23a48;
    --warn: #b7791f;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink);
    background: #fff;
    font-size: 12px;
    line-height: 1.5;
  }
  .page { max-width: 210mm; margin: 0 auto; padding: 16mm 15mm; }

  /* Header */
  .masthead {
    display: flex; justify-content: space-between; align-items: stretch;
    border-bottom: 3px solid var(--brand); padding-bottom: 14px; margin-bottom: 14px;
  }
  .mast { display: flex; flex-direction: column; gap: 4px; }
  .org { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
  h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.01em; color: var(--brand); }
  .doc-no { font-size: 11px; color: var(--muted); }
  .mast-right { text-align: right; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; }
  .mast-right .tag {
    font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: #fff; background: var(--brand); border: 1px solid var(--brand); padding: 4px 10px;
  }
  .mast-right .when { font-size: 11px; color: var(--muted); }

  /* Metadata table */
  table.meta { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  table.meta td.meta-cell { border: 1px solid var(--line); padding: 0; vertical-align: top; width: 50%; }
  .kv { display: flex; }
  .kv .k {
    min-width: 118px; background: var(--brand-soft); color: var(--brand); font-weight: 700;
    font-size: 10.5px; letter-spacing: 0.04em; text-transform: uppercase; padding: 7px 10px;
    border-right: 1px solid var(--line);
  }
  .kv .v { padding: 7px 12px; font-weight: 600; }

  /* Summary */
  .summary { display: flex; margin-bottom: 20px; border: 1px solid var(--line); }
  .stat { flex: 1; padding: 10px 14px; }
  .stat + .stat { border-left: 1px solid var(--line); }
  .stat .num { font-size: 21px; font-weight: 800; color: var(--brand); }
  .stat .lbl { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }

  .floor { margin-bottom: 26px; }
  .floor-title {
    font-size: 18px; font-weight: 800; letter-spacing: 0.02em; color: var(--brand);
    margin: 24px 0 14px; padding: 8px 12px; background: var(--brand-soft);
    border-left: 4px solid var(--brand);
  }
  .floor:first-child .floor-title { margin-top: 0; }

  .unit { margin-bottom: 24px; break-inside: avoid; }
  .unit-head {
    display: flex; justify-content: space-between; align-items: center;
    background: #2a2a2a; color: #fff; padding: 8px 14px; margin-bottom: 10px;
  }
  .unit-title { display: flex; align-items: center; gap: 10px; }
  .apt { font-size: 15px; font-weight: 800; letter-spacing: 0.03em; }
  .unit-head .sep { opacity: 0.45; }
  .status { font-size: 10.5px; font-weight: 700; padding: 2px 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  .status-done { background: rgba(255,255,255,0.16); }
  .status-draft { background: rgba(255,255,255,0.22); }
  .unit-meta { display: flex; gap: 10px; font-size: 11px; color: rgba(255,255,255,0.85); }
  .dot-sep { opacity: 0.4; }

  /* Checklist table */
  table.checklist { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  table.checklist th {
    text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--muted); border-bottom: 2px solid var(--line); padding: 5px 8px; background: #f7f9fb;
  }
  table.checklist td { padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  table.checklist td.idx { width: 28px; color: var(--muted); font-size: 11px; }
  td.check-title { width: 42%; font-weight: 600; }
  td.check-note { width: 32%; color: var(--muted); }
  td.qty { width: 40px; text-align: center; }
  td.answer { width: 110px; text-align: right; }
  .stamp { display: inline-block; font-size: 10.5px; font-weight: 700; padding: 2px 8px; color: #fff; }
  .stamp.good { background: var(--good); }
  .stamp.bad { background: var(--bad); }
  .stamp.warn { background: var(--warn); }
  .stamp.neut { background: #8a94a3; }

  /* Gallery */
  .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; }
  .grid img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border: 1px solid var(--line); border-radius: 4px; display: block; }
  .empty { color: var(--muted); font-style: italic; }

  footer {
    margin-top: 16px; border-top: 1px solid var(--line); padding-top: 8px;
    color: var(--muted); font-size: 10px; display: flex; justify-content: space-between;
  }

  @page { size: A4; margin: 0; }
  @media print {
    .page { padding: 14mm 13mm; }
    .unit { break-inside: avoid; }
    .grid { grid-template-columns: repeat(6, 1fr); }
  }
</style>
</head>
<body>
  <div class="page">
    <header class="masthead">
      <div class="mast">
        <div class="org">Alyson Vilela &middot; Vistoria e Acompanhamento de Obras</div>
        <h1>Relatório de Vistoria Diária</h1>
        <div class="doc-no">${esc(model.documentNo)}</div>
      </div>
      <div class="mast-right">
        <span class="tag">Relatório Diário</span>
        <span class="when">Emitido em ${esc(model.generatedAt)}</span>
      </div>
    </header>

    ${metadataTable}

    <div class="summary">
      <div class="stat"><div class="num">${totalUnits}</div><div class="lbl">Unidades</div></div>
      <div class="stat"><div class="num">${model.floors.length}</div><div class="lbl">Andares</div></div>
      <div class="stat"><div class="num">${model.totalPhotos}</div><div class="lbl">Fotos</div></div>
      ${model.totalChecked > 0 ? `<div class="stat"><div class="num">${model.totalChecked}</div><div class="lbl">Itens verificados</div></div>` : ""}
    </div>

    ${sections}

    <footer>
      <span>${esc(model.documentNo)}</span>
      <span>Responsável: ${esc(model.inspector)}</span>
      <span>Página &ndash; gerado automaticamente</span>
    </footer>
  </div>
</body>
</html>`;
}