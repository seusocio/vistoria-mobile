#!/usr/bin/env python3
"""
Gera `standalone/` a partir dos arquivos `NN-*.sql` desta pasta.

Existe porque o editor nativo do Metabase não roda DDL nem várias instruções:
colar um `CREATE VIEW` lá dá "Select statement did not produce a ResultSet".
Então cada card precisa ser UM `SELECT` autossuficiente, com as views de que
depende embutidas como CTE no topo.

`standalone/` é GERADO. Nunca edite à mão — edite o `NN-*.sql` e rode isto.

Fluxo:  editar NN-*.sql  ->  python3 gen.py  ->  bun run provision.ts

Cada view só é embutida no card que a referencia (direta ou transitivamente),
em ordem topológica. Antes, as 4 views base iam coladas em todo card, o que
deixava o 10-andamento.sql com 202 KB de CTE que o Postgres nem executava.
"""
import re
import pathlib

BASE = pathlib.Path(__file__).resolve().parent
VIEW_RE = re.compile(r"CREATE VIEW (\w+) AS\n(.*?);\n", re.S)

HEADER = """\
-- ---------------------------------------------------------------------
-- {title}
-- VERSÃO STANDALONE — GERADA POR gen.py, NÃO EDITE.
-- Cole um card inteiro no editor nativo do Metabase: o bloco WITH no topo
-- é a definição das views embutida, então não é preciso criar view nenhuma.
-- ---------------------------------------------------------------------

"""


def indent(body: str) -> str:
    return "\n".join("  " + l if l.strip() else l for l in body.strip().split("\n"))


def collect_views() -> dict[str, str]:
    """Todas as views definidas em qualquer NN-*.sql, por nome."""
    views: dict[str, str] = {}
    for src in sorted(BASE.glob("[0-9][0-9]-*.sql")):
        for name, body in VIEW_RE.findall(src.read_text()):
            views[name] = body
    return views


def needed(sql: str, views: dict[str, str], seen: list[str] | None = None) -> list[str]:
    """Views que este SQL usa, em ordem topológica (dependência antes de quem usa)."""
    seen = [] if seen is None else seen
    for name, body in views.items():
        if name in seen:
            continue
        if not re.search(rf"\b{name}\b", sql):
            continue
        seen.append(name)          # marca antes de descer, corta ciclo
        needed(body, views, seen)
        seen.remove(name)
        seen.append(name)          # reinsere depois das suas dependências
    return seen


def preamble(sql: str, views: dict[str, str]) -> str:
    ordem = needed(sql, views)
    if not ordem:
        return ""
    return "WITH " + ",\n".join(f"{n} AS (\n{indent(views[n])}\n)" for n in ordem)


def comment_out(text: str) -> str:
    return "\n".join(
        l if l.lstrip().startswith("--") or not l.strip() else "-- " + l
        for l in text.split("\n")
    )


def main() -> None:
    views = collect_views()
    out = BASE / "standalone"
    out.mkdir(exist_ok=True)

    for src in sorted(BASE.glob("[0-9][0-9]-*.sql")):
        text = src.read_text()
        chunks = re.split(r"\n(?=-- @card )", text)

        head = chunks[0].strip()
        # o cabeçalho pode conter DDL; comenta, porque não vai para o Metabase
        if re.search(r"^\s*(CREATE|DROP) VIEW", head, re.M):
            head = comment_out(head)
        titulos = [l for l in head.split("\n") if l.startswith("-- ") and l[3:4].isupper()]
        title = titulos[0][3:] if titulos else src.stem

        pieces = [HEADER.format(title=title), head, ""]
        n_cards = 0
        for chunk in chunks[1:]:
            linhas = chunk.strip().split("\n")
            comentarios, corpo = [], []
            for l in linhas:
                (comentarios if not corpo and l.lstrip().startswith("--") else corpo).append(l)
            sql = "\n".join(corpo).strip().rstrip(";").strip()
            if not sql:                                   # card só de comentário
                pieces.append("\n".join(comentarios) + "\n")
                continue
            if re.match(r"(CREATE|DROP) VIEW", sql, re.I):
                pieces.append(
                    "\n".join(comentarios)
                    + "\n-- (DDL — não vai para o Metabase; ver README)\n"
                    + comment_out(sql) + "\n"
                )
                continue
            pre = preamble(sql, views)
            if not pre:
                merged = sql
            elif re.match(r"WITH\s", sql, re.I):
                merged = pre + ",\n" + re.sub(r"^WITH\s+", "", sql, flags=re.I)
            else:
                merged = pre + "\n" + sql
            pieces.append("\n".join(comentarios) + "\n" + merged + ";\n")
            n_cards += 1

        destino = out / src.name
        destino.write_text("\n".join(pieces))
        kb = destino.stat().st_size / 1024
        print(f"gerado: standalone/{src.name}  ({n_cards} cards, {kb:.0f} KB)")


if __name__ == "__main__":
    main()
